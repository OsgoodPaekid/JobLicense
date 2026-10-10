import { Router } from "express";
import { query } from "../db/index.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        (SELECT row_to_json(j) FROM (
          SELECT
            COUNT(*) AS total_jobs,
            COUNT(*) FILTER (WHERE current_stage = 'New / Not Started') AS not_started,
            COUNT(*) FILTER (WHERE current_stage NOT IN ('New / Not Started','Completed','Cancelled','On Hold')) AS in_progress,
            COUNT(*) FILTER (WHERE current_stage = 'Completed') AS completed,
            COUNT(*) FILTER (WHERE current_stage = 'On Hold') AS on_hold,
            COUNT(*) FILTER (WHERE payment_status = 'Fully Paid') AS fully_paid,
            COUNT(*) FILTER (WHERE payment_status = 'Partially Paid') AS partially_paid,
            COUNT(*) FILTER (WHERE payment_status = 'Unpaid') AS unpaid,
            COALESCE(SUM(total_amount), 0) AS total_expected,
            COALESCE(SUM(total_paid), 0) AS total_collected,
            COALESCE(SUM(outstanding_balance), 0) AS total_outstanding
          FROM job_summary
        ) j) AS job_counts,
        (SELECT COUNT(*) FROM clients) AS client_count,
        (SELECT COUNT(*) FROM middlemen) AS middleman_count,
        (SELECT COALESCE(json_agg(s ORDER BY s.sort_key), '[]'::json) FROM (
          SELECT current_stage AS stage, COUNT(*) AS count, MIN(stage_entered_at) AS sort_key
          FROM job_summary GROUP BY current_stage
        ) s) AS jobs_by_stage,
        (SELECT COALESCE(json_agg(mc ORDER BY mc.month), '[]'::json) FROM (
          SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month,
                 SUM(amount) AS total
          FROM payments
          WHERE payment_date >= (CURRENT_DATE - INTERVAL '11 months')
          GROUP BY 1
        ) mc) AS monthly_collections,
        (SELECT COALESCE(json_agg(tm ORDER BY tm.total_value DESC), '[]'::json) FROM (
          SELECT m.name, COUNT(j.id) AS job_count, COALESCE(SUM(j.total_amount),0) AS total_value
          FROM middlemen m
          JOIN clients c ON c.middleman_id = m.id
          JOIN jobs j ON j.client_id = c.id
          GROUP BY m.id ORDER BY total_value DESC LIMIT 5
        ) tm) AS top_middlemen
    `);

    const row = result.rows[0];
    res.json({
      ...row.job_counts,
      client_count: Number(row.client_count),
      middleman_count: Number(row.middleman_count),
      jobs_by_stage: row.jobs_by_stage,
      monthly_collections: row.monthly_collections,
      top_middlemen: row.top_middlemen,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
