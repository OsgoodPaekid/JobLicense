import { Router } from "express";
import { query } from "../db/index.js";

const router = Router();

// List all middlemen, with quick counts of what they've brought in.
router.get("/", async (req, res) => {
  const { search } = req.query;
  const params = [];
  let where = "";
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE m.name ILIKE $${params.length} OR m.phone ILIKE $${params.length} OR m.company ILIKE $${params.length}`;
  }
  const { rows } = await query(
    `SELECT m.*,
       COUNT(DISTINCT c.id) AS client_count,
       COUNT(DISTINCT j.id) AS job_count,
       COALESCE(SUM(j.total_amount), 0) AS total_business_value,
       COALESCE(SUM(js.outstanding_balance), 0) AS total_outstanding
     FROM middlemen m
     LEFT JOIN clients c ON c.middleman_id = m.id
     LEFT JOIN jobs j ON j.client_id = c.id
     LEFT JOIN job_summary js ON js.id = j.id
     ${where}
     GROUP BY m.id
     ORDER BY m.name`,
    params
  );
  res.json(rows);
});

// One middleman's full profile: their clients, jobs, and money numbers.
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const middleman = await query("SELECT * FROM middlemen WHERE id = $1", [id]);
  if (middleman.rows.length === 0) return res.status(404).json({ error: "Middleman not found" });

  const clients = await query("SELECT * FROM clients WHERE middleman_id = $1 ORDER BY name", [id]);
  const jobs = await query(
    `SELECT js.* FROM job_summary js
     JOIN clients c ON c.id = js.client_id
     WHERE c.middleman_id = $1
     ORDER BY js.date_received DESC`,
    [id]
  );

  const totals = {
    client_count: clients.rows.length,
    job_count: jobs.rows.length,
    completed_jobs: jobs.rows.filter((j) => j.current_stage === "Completed").length,
    pending_jobs: jobs.rows.filter((j) => !["Completed", "Cancelled"].includes(j.current_stage)).length,
    total_business_value: jobs.rows.reduce((sum, j) => sum + Number(j.total_amount), 0),
    total_outstanding: jobs.rows.reduce((sum, j) => sum + Number(j.outstanding_balance), 0),
  };

  res.json({ ...middleman.rows[0], clients: clients.rows, jobs: jobs.rows, totals });
});

router.post("/", async (req, res) => {
  const { name, phone, company, notes } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  const { rows } = await query(
    "INSERT INTO middlemen (name, phone, company, notes) VALUES ($1,$2,$3,$4) RETURNING *",
    [name, phone || null, company || null, notes || null]
  );
  res.status(201).json(rows[0]);
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, phone, company, notes } = req.body;
  const { rows } = await query(
    "UPDATE middlemen SET name=$1, phone=$2, company=$3, notes=$4 WHERE id=$5 RETURNING *",
    [name, phone || null, company || null, notes || null, id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Middleman not found" });
  res.json(rows[0]);
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  await query("DELETE FROM middlemen WHERE id=$1", [id]);
  res.status(204).end();
});

export default router;
