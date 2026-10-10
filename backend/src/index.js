import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import middlemenRoutes from "./routes/middlemen.js";
import clientsRoutes from "./routes/clients.js";
import jobsRoutes from "./routes/jobs.js";
import paymentsRoutes from "./routes/payments.js";
import dashboardRoutes from "./routes/dashboard.js";
import reportsRoutes from "./routes/reports.js";
import stagesRoutes from "./routes/stages.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/middlemen", middlemenRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/stages", stagesRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Something went wrong" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend running on http://localhost:${port}`));
