ALTER TABLE public.public_bot_users ADD COLUMN IF NOT EXISTS telegram_name text, ADD COLUMN IF NOT EXISTS telegram_username text;
GRANT ALL ON public.public_bot_users TO service_role;