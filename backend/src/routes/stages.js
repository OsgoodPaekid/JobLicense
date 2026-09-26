import { Router } from "express";
import { query } from "../db/index.js";

const router = Router();

router.get("/", async (req, res) => {
  const { rows } = await query("SELECT * FROM stages ORDER BY sort_order");
  res.json(rows);
});

router.post("/", async (req, res) => {
  const { name, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const { rows } = await query(
    "INSERT INTO stages (name, sort_order) VALUES ($1,$2) RETURNING *",
    [name, sort_order || 999]
  );
  res.status(201).json(rows[0]);
});

router.delete("/:id", async (req, res) => {
  await query("DELETE FROM stages WHERE id=$1", [req.params.id]);
  res.status(204).end();
});

export default router;
