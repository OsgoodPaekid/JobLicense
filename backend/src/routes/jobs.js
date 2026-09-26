import { Router } from "express";
import { query } from "../db/index.js";

const router = Router();

// List jobs with all the filters the app needs: client, phone, job number,
// license type, stage, payment status, middleman, and date ranges.
router.get("/", async (req, res) => {
  const {
    search, stage, payment_status, middleman_id, license_type,
    date_received_from, date_received_to,
    expected_from, expected_to,
  } = req.query;

  const params = [];
  const clauses = [];

  if (search) {
    params.push(`%${search}%`);
    const i = params.length;
    clauses.push(`(js.client_name ILIKE $${i} OR js.client_phone ILIKE $${i} OR js.job_number ILIKE $${i})`);
  }
  if (stage) { params.push(stage); clauses.push(`js.current_stage = $${params.length}`); }
  if (payment_status) { params.push(payment_status); clauses.push(`js.payment_status = $${params.length}`); }
  if (middleman_id) { params.push(middleman_id); clauses.push(`js.middleman_id = $${params.length}`); }
  if (license_type) { params.push(`%${license_type}%`); clauses.push(`js.license_type ILIKE $${params.length}`); }
  if (date_received_from) { params.push(date_received_from); clauses.push(`js.date_received >= $${params.length}`); }
  if (date_received_to) { params.push(date_received_to); clauses.push(`js.date_received <= $${params.length}`); }
  if (expected_from) { params.push(expected_from); clauses.push(`js.expected_completion_date >= $${params.length}`); }
  if (expected_to) { params.push(expected_to); clauses.push(`js.expected_completion_date <= $${params.length}`); }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await query(
    `SELECT js.* FROM job_summary js ${where} ORDER BY js.date_received DESC`,
    params
  );
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const job = await query("SELECT * FROM job_summary WHERE id = $1", [id]);
  if (job.rows.length === 0) return res.status(404).json({ error: "Job not found" });

  const history = await query(
    "SELECT * FROM job_stage_history WHERE job_id = $1 ORDER BY changed_at ASC", [id]
  );
  const payments = await query(
    "SELECT * FROM payments WHERE job_id = $1 ORDER BY payment_date DESC, id DESC", [id]
  );

  res.json({ ...job.rows[0], stage_history: history.rows, payments: payments.rows });
});

router.post("/", async (req, res) => {
  const {
    client_id, license_type, description, total_amount,
    date_received, expected_completion_date,
  } = req.body;

  if (!client_id || !license_type) {
    return res.status(400).json({ error: "client_id and license_type are required" });
  }

  await query("BEGIN");
  try {
    // Insert with a throwaway unique placeholder for job_number (satisfies
    // NOT NULL / UNIQUE), then overwrite it with the row's own id.
    const inserted = await query(
      `INSERT INTO jobs (job_number, client_id, license_type, description, total_amount, date_received, expected_completion_date)
       VALUES (md5(random()::text || clock_timestamp()::text), $1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6)
       RETURNING *`,
      [client_id, license_type, description || null, total_amount || 0, date_received || null, expected_completion_date || null]
    );
    let job = inserted.rows[0];

    const updated = await query(
      `UPDATE jobs SET job_number = id::text WHERE id = $1 RETURNING *`,
      [job.id]
    );
    job = updated.rows[0];

    await query(
      "INSERT INTO job_stage_history (job_id, stage, notes) VALUES ($1,$2,$3)",
      [job.id, job.current_stage, "Job created"]
    );
    await query("COMMIT");
    res.status(201).json(job);
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    job_number, client_id, license_type, description, total_amount,
    date_received, expected_completion_date, actual_completion_date,
  } = req.body;

  const { rows } = await query(
    `UPDATE jobs SET
       job_number=$1, client_id=$2, license_type=$3, description=$4, total_amount=$5,
       date_received=$6, expected_completion_date=$7, actual_completion_date=$8, updated_at=now()
     WHERE id=$9 RETURNING *`,
    [job_number, client_id, license_type, description || null, total_amount || 0,
     date_received, expected_completion_date || null, actual_completion_date || null, id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Job not found" });
  res.json(rows[0]);
});

// Move a job to a new stage. This is the one action that matters most day-to-day.
router.post("/:id/stage", async (req, res) => {
  const { id } = req.params;
  const { stage, notes } = req.body;
  if (!stage) return res.status(400).json({ error: "stage is required" });

  await query("BEGIN");
  try {
    const isCompleted = stage === "Completed";
    const { rows } = await query(
      `UPDATE jobs SET current_stage=$1, stage_entered_at=now(), updated_at=now()
       ${isCompleted ? ", actual_completion_date = COALESCE(actual_completion_date, CURRENT_DATE)" : ""}
       WHERE id=$2 RETURNING *`,
      [stage, id]
    );
    if (rows.length === 0) { await query("ROLLBACK"); return res.status(404).json({ error: "Job not found" }); }

    await query("INSERT INTO job_stage_history (job_id, stage, notes) VALUES ($1,$2,$3)", [id, stage, notes || null]);
    await query("COMMIT");
    res.json(rows[0]);
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  await query("DELETE FROM jobs WHERE id=$1", [id]);
  res.status(204).end();
});

// Jobs that need attention: stuck at a stage too long, overdue, or unpaid.
router.get("/alerts/list", async (req, res) => {
  const stuckDays = Number(req.query.stuck_days) || 7;
  const stuck = await query(
    `SELECT * FROM job_summary
     WHERE current_stage NOT IN ('Completed', 'Cancelled')
       AND stage_entered_at < now() - ($1 || ' days')::interval
     ORDER BY stage_entered_at ASC`,
    [stuckDays]
  );
  const overdue = await query(
    `SELECT * FROM job_summary
     WHERE current_stage NOT IN ('Completed', 'Cancelled')
       AND expected_completion_date IS NOT NULL
       AND expected_completion_date < CURRENT_DATE
     ORDER BY expected_completion_date ASC`
  );
  const unpaid = await query(
    `SELECT * FROM job_summary WHERE payment_status IN ('Unpaid','Partially Paid')
     ORDER BY outstanding_balance DESC`
  );
  const notStarted = await query(
    `SELECT * FROM job_summary WHERE current_stage = 'New / Not Started' ORDER BY date_received ASC`
  );
  res.json({
    stuck: stuck.rows,
    overdue: overdue.rows,
    unpaid: unpaid.rows,
    not_started: notStarted.rows,
  });
});

export default router;
