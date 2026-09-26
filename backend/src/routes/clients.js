import { Router } from "express";
import { query } from "../db/index.js";

const router = Router();

router.get("/", async (req, res) => {
  const { search } = req.query;
  const params = [];
  let where = "";
  if (search) {
    params.push(`%${search}%`);
    where = `WHERE c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.email ILIKE $${params.length}`;
  }
  const { rows } = await query(
    `SELECT c.*, m.name AS middleman_name,
       COUNT(j.id) AS job_count
     FROM clients c
     LEFT JOIN middlemen m ON m.id = c.middleman_id
     LEFT JOIN jobs j ON j.client_id = c.id
     ${where}
     GROUP BY c.id, m.name
     ORDER BY c.name`,
    params
  );
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const client = await query(
    `SELECT c.*, m.name AS middleman_name FROM clients c
     LEFT JOIN middlemen m ON m.id = c.middleman_id WHERE c.id = $1`,
    [id]
  );
  if (client.rows.length === 0) return res.status(404).json({ error: "Client not found" });
  const jobs = await query("SELECT * FROM job_summary WHERE client_id = $1 ORDER BY date_received DESC", [id]);
  res.json({ ...client.rows[0], jobs: jobs.rows });
});

router.post("/", async (req, res) => {
  const { name, phone, email, address, middleman_id, referral_date, referral_notes } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  const { rows } = await query(
    `INSERT INTO clients (name, phone, email, address, middleman_id, referral_date, referral_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, phone || null, email || null, address || null, middleman_id || null, referral_date || null, referral_notes || null]
  );
  res.status(201).json(rows[0]);
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, address, middleman_id, referral_date, referral_notes } = req.body;
  const { rows } = await query(
    `UPDATE clients SET name=$1, phone=$2, email=$3, address=$4, middleman_id=$5, referral_date=$6, referral_notes=$7
     WHERE id=$8 RETURNING *`,
    [name, phone || null, email || null, address || null, middleman_id || null, referral_date || null, referral_notes || null, id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Client not found" });
  res.json(rows[0]);
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  await query("DELETE FROM clients WHERE id=$1", [id]);
  res.status(204).end();
});

export default router;
