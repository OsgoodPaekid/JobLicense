import { Router } from "express";
import { query } from "../db/index.js";

const router = Router();

function toCSV(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
  return lines.join("\n");
}

// Shared filter: jobs received within a date range, optionally by stage/payment status/middleman.
async function getFilteredJobs({ from, to, stage, payment_status, middleman_id }) {
  const params = [];
  const clauses = [];
  if (from) { params.push(from); clauses.push(`date_received >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`date_received <= $${params.length}`); }
  if (stage) { params.push(stage); clauses.push(`current_stage = $${params.length}`); }
  if (payment_status) { params.push(payment_status); clauses.push(`payment_status = $${params.length}`); }
  if (middleman_id) { params.push(middleman_id); clauses.push(`middleman_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await query(`SELECT * FROM job_summary ${where} ORDER BY date_received DESC`, params);
  return rows;
}

router.get("/jobs", async (req, res) => {
  const rows = await getFilteredJobs(req.query);
  if (req.query.format === "csv") {
    res.header("Content-Type", "text/csv");
    res.attachment("jobs-report.csv");
    return res.send(toCSV(rows));
  }
  res.json(rows);
});

router.get("/payments", async (req, res) => {
  const { from, to, middleman_id } = req.query;
  const params = [];
  const clauses = [];
  if (from) { params.push(from); clauses.push(`p.payment_date >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`p.payment_date <= $${params.length}`); }
  if (middleman_id) { params.push(middleman_id); clauses.push(`c.middleman_id = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await query(
    `SELECT p.id, p.payment_date, p.amount, p.method, p.reference, j.job_number, c.name AS client_name
     FROM payments p JOIN jobs j ON j.id = p.job_id JOIN clients c ON c.id = j.client_id
     ${where} ORDER BY p.payment_date DESC`,
    params
  );
  if (req.query.format === "csv") {
    res.header("Content-Type", "text/csv");
    res.attachment("payments-report.csv");
    return res.send(toCSV(rows));
  }
  res.json(rows);
});

router.get("/middlemen", async (req, res) => {
  const { rows } = await query(`
    SELECT m.name, m.phone, m.company,
      COUNT(DISTINCT c.id) AS clients_referred,
      COUNT(DISTINCT j.id) AS jobs_referred,
      COUNT(DISTINCT j.id) FILTER (WHERE j.current_stage = 'Completed') AS jobs_completed,
      COALESCE(SUM(j.total_amount), 0) AS total_business_value
    FROM middlemen m
    LEFT JOIN clients c ON c.middleman_id = m.id
    LEFT JOIN jobs j ON j.client_id = c.id
    GROUP BY m.id ORDER BY total_business_value DESC
  `);
  if (req.query.format === "csv") {
    res.header("Content-Type", "text/csv");
    res.attachment("middlemen-report.csv");
    return res.send(toCSV(rows));
  }
  res.json(rows);
});

export default router;
