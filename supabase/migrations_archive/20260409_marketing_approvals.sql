-- Marketing approval system for ZendIQ
-- Stores generated ads/content and tracks approval status via WhatsApp

CREATE TABLE IF NOT EXISTS marketing_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name text NOT NULL,
  channel text NOT NULL,
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ADJUST')),
  ceo_phone text NOT NULL,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  published_at timestamptz
);

CREATE INDEX idx_marketing_approvals_status ON marketing_approvals(status);
CREATE INDEX idx_marketing_approvals_created ON marketing_approvals(created_at DESC);
