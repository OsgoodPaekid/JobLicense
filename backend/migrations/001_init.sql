-- License Job Tracking App — initial schema
-- Run this once against your Neon database (see README for how).

CREATE TABLE IF NOT EXISTS middlemen (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  middleman_id INTEGER REFERENCES middlemen(id) ON DELETE SET NULL,
  referral_date DATE,
  referral_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stages (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  sort_order INTEGER NOT NULL
);

INSERT INTO stages (name, sort_order) VALUES
  ('New / Not Started', 1),
  ('Documents Received', 2),
  ('Documents Being Processed', 3),
  ('Application Submitted', 4),
  ('Awaiting Approval', 5),
  ('Approved', 6),
  ('Ready for Collection', 7),
  ('Completed', 8),
  ('On Hold', 9),
  ('Cancelled', 10)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  job_number TEXT UNIQUE NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  license_type TEXT NOT NULL,
  description TEXT,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  date_received DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_completion_date DATE,
  actual_completion_date DATE,
  current_stage TEXT NOT NULL DEFAULT 'New / Not Started',
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_stage_history (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_stage ON jobs(current_stage);
CREATE INDEX IF NOT EXISTS idx_jobs_job_number ON jobs(job_number);
CREATE INDEX IF NOT EXISTS idx_clients_middleman ON clients(middleman_id);
CREATE INDEX IF NOT EXISTS idx_payments_job ON payments(job_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_job ON job_stage_history(job_id);

-- A view that does the money math for us automatically, everywhere we need it.
CREATE OR REPLACE VIEW job_summary AS
SELECT
  j.*,
  COALESCE(p.total_paid, 0) AS total_paid,
  (j.total_amount - COALESCE(p.total_paid, 0)) AS outstanding_balance,
  CASE
    WHEN COALESCE(p.total_paid, 0) <= 0 THEN 'Unpaid'
    WHEN COALESCE(p.total_paid, 0) >= j.total_amount THEN 'Fully Paid'
    ELSE 'Partially Paid'
  END AS payment_status,
  c.name AS client_name,
  c.phone AS client_phone,
  c.email AS client_email,
  c.middleman_id AS middleman_id,
  m.name AS middleman_name
FROM jobs j
JOIN clients c ON c.id = j.client_id
LEFT JOIN middlemen m ON m.id = c.middleman_id
LEFT JOIN (
  SELECT job_id, SUM(amount) AS total_paid FROM payments GROUP BY job_id
) p ON p.job_id = j.id;
