CREATE TABLE IF NOT EXISTS browser_waitlist_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  browser text NOT NULL CHECK (browser IN ('chrome', 'edge', 'firefox', 'safari', 'opera', 'vivaldi', 'brave')),
  source text,
  page text,
  referrer text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, browser)
);

ALTER TABLE browser_waitlist_leads
ADD COLUMN IF NOT EXISTS page text,
ADD COLUMN IF NOT EXISTS utm jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS user_agent text;

ALTER TABLE browser_waitlist_leads
DROP CONSTRAINT IF EXISTS browser_waitlist_leads_browser_check;

ALTER TABLE browser_waitlist_leads
ADD CONSTRAINT browser_waitlist_leads_browser_check
CHECK (browser IN ('chrome', 'edge', 'firefox', 'safari', 'opera', 'vivaldi', 'brave'));

COMMENT ON TABLE browser_waitlist_leads IS 'Browser launch waitlist leads. Inserts are performed by backend/serverless code with service role credentials; do not grant public insert access.';

CREATE INDEX IF NOT EXISTS idx_browser_waitlist_leads_browser
ON browser_waitlist_leads(browser);

CREATE INDEX IF NOT EXISTS idx_browser_waitlist_leads_created_at
ON browser_waitlist_leads(created_at DESC);
