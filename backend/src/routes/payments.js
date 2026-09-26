import { Router } from "express";
import { query } from "../db/index.js";

const router = Router();

router.get("/", async (req, res) => {
  const { job_id } = req.query;
  const params = [];
  let where = "";
  if (job_id) { params.push(job_id); where = "WHERE p.job_id = $1"; }
  const { rows } = await query(
    `SELECT p.*, j.job_number, c.name AS client_name
     FROM payments p
     JOIN jobs j ON j.id = p.job_id
     JOIN clients c ON c.id = j.client_id
     ${where}
     ORDER BY p.payment_date DESC, p.id DESC`,
    params
  );
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { job_id, amount, payment_date, method, reference, notes } = req.body;
  if (!job_id || !amount) return res.status(400).json({ error: "job_id and amount are required" });
  const { rows } = await query(
    `INSERT INTO payments (job_id, amount, payment_date, method, reference, notes)
     VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6) RETURNING *`,
    [job_id, amount, payment_date || null, method || null, reference || null, notes || null]
  );
  res.status(201).json(rows[0]);
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { amount, payment_date, method, reference, notes } = req.body;
  const { rows } = await query(
    `UPDATE payments SET amount=$1, payment_date=$2, method=$3, reference=$4, notes=$5 WHERE id=$6 RETURNING *`,
    [amount, payment_date, method || null, reference || null, notes || null, id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Payment not found" });
  res.json(rows[0]); // outstanding balance recalculates automatically via job_summary view
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  await query("DELETE FROM payments WHERE id=$1", [id]); // balance recalculates automatically
  res.status(204).end();
});

export default router;
