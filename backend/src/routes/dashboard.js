import { Router } from "express";
import { query } from "../db/index.js";

const router = Router();

router.get("/", async (req, res) => {
  const [
    jobCounts,
    clientCount,
    middlemanCount,
    byStage,
    monthlyCollections,
    topMiddlemen,
  ] = await Promise.all([
    query(`
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
    `),
    query("SELECT COUNT(*) AS n FROM clients"),
    query("SELECT COUNT(*) AS n FROM middlemen"),
    query(`
      SELECT current_stage AS stage, COUNT(*) AS count
      FROM job_summary GROUP BY current_stage ORDER BY MIN(stage_entered_at)
    `),
    query(`
      SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month,
             SUM(amount) AS total
      FROM payments
      WHERE payment_date >= (CURRENT_DATE - INTERVAL '11 months')
      GROUP BY 1 ORDER BY 1
    `),
    query(`
      SELECT m.name, COUNT(j.id) AS job_count, COALESCE(SUM(j.total_amount),0) AS total_value
      FROM middlemen m
      JOIN clients c ON c.middleman_id = m.id
      JOIN jobs j ON j.client_id = c.id
      GROUP BY m.id ORDER BY total_value DESC LIMIT 5
    `),
  ]);

  res.json({
    ...jobCounts.rows[0],
    client_count: Number(clientCount.rows[0].n),
    middleman_count: Number(middlemanCount.rows[0].n),
    jobs_by_stage: byStage.rows,
    monthly_collections: monthlyCollections.rows,
    top_middlemen: topMiddlemen.rows,
  });
});

export default router;
