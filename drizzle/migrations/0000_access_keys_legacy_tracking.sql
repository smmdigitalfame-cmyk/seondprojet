ALTER TABLE public.access_keys ADD COLUMN IF NOT EXISTS legacy boolean NOT NULL DEFAULT false;
ALTER TABLE public.access_keys ADD COLUMN IF NOT EXISTS legacy_checked_at timestamptz;