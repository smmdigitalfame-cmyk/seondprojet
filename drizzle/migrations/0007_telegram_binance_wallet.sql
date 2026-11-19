CREATE TABLE public.bot_wallet_settings (id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), usdt_rate numeric(16,6) NOT NULL DEFAULT 90 CHECK (usdt_rate > 0), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot_wallet_settings TO service_role;
ALTER TABLE public.bot_wallet_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot_wallets (telegram_chat_id text PRIMARY KEY, balance_paise bigint NOT NULL DEFAULT 0 CHECK (balance_paise >= 0), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot_wallets TO service_role;
ALTER TABLE public.bot_wallets ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot_wallet_sessions (telegram_chat_id text PRIMARY KEY, step text NOT NULL CHECK (step IN ('amount','transaction')), request_id uuid, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot_wallet_sessions TO service_role;
ALTER TABLE public.bot_wallet_sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot_wallet_topups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), telegram_chat_id text NOT NULL, update_id bigint NOT NULL UNIQUE, amount_paise bigint NOT NULL CHECK (amount_paise >= 1000), usdt_rate numeric(16,6) NOT NULL CHECK (usdt_rate > 0), expected_usdt numeric(24,8) NOT NULL CHECK (expected_usdt > 0), payment_usdt numeric(24,8) NOT NULL UNIQUE, submitted_id text, status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','review','approved','rejected')), approval_mode text CHECK (approval_mode IN ('auto','manual')), reviewed_by text, review_reason text, provider_verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), credited_at timestamptz);
GRANT ALL ON public.bot_wallet_topups TO service_role;
ALTER TABLE public.bot_wallet_topups ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot_wallet_transaction_claims (alias text PRIMARY KEY, topup_id uuid NOT NULL REFERENCES public.bot_wallet_topups(id), created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.bot_wallet_transaction_claims TO service_role;
ALTER TABLE public.bot_wallet_transaction_claims ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.bot_wallet_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), topup_id uuid NOT NULL REFERENCES public.bot_wallet_topups(id), recipient text NOT NULL, kind text NOT NULL CHECK (kind IN ('review','auto','manual','rejected')), delivered_at timestamptz, UNIQUE(topup_id,recipient,kind));
GRANT ALL ON public.bot_wallet_notifications TO service_role;
ALTER TABLE public.bot_wallet_notifications ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.credit_bot_wallet(p_topup_id uuid,p_aliases text[],p_mode text,p_actor text,p_verified boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.bot_wallet_topups; a text; other_id uuid;
BEGIN
 SELECT * INTO r FROM public.bot_wallet_topups WHERE id=p_topup_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request missing'; END IF;
 IF r.status='approved' THEN RETURN false; END IF;
 IF r.status='rejected' OR r.submitted_id IS NULL THEN RAISE EXCEPTION 'Request not payable'; END IF;
 IF p_mode NOT IN ('auto','manual') OR (p_mode='auto' AND NOT p_verified) THEN RAISE EXCEPTION 'Verification required'; END IF;
 IF array_length(p_aliases,1) IS NULL OR NOT (r.submitted_id=ANY(p_aliases)) THEN RAISE EXCEPTION 'Transaction identity required'; END IF;
 FOR a IN SELECT DISTINCT unnest(p_aliases) ORDER BY 1 LOOP
  IF a IS NULL OR length(a)<1 OR length(a)>128 THEN RAISE EXCEPTION 'Invalid transaction'; END IF;
  INSERT INTO public.bot_wallet_transaction_claims(alias,topup_id) VALUES(a,r.id) ON CONFLICT DO NOTHING;
  SELECT topup_id INTO other_id FROM public.bot_wallet_transaction_claims WHERE alias=a;
  IF other_id IS DISTINCT FROM r.id THEN RAISE EXCEPTION 'Transaction already used'; END IF;
 END LOOP;
 INSERT INTO public.bot_wallets(telegram_chat_id,balance_paise) VALUES(r.telegram_chat_id,r.amount_paise) ON CONFLICT(telegram_chat_id) DO UPDATE SET balance_paise=public.bot_wallets.balance_paise+EXCLUDED.balance_paise,updated_at=now();
 UPDATE public.bot_wallet_topups SET status='approved',approval_mode=p_mode,reviewed_by=p_actor,provider_verified_at=CASE WHEN p_verified THEN now() ELSE NULL END,credited_at=now() WHERE id=r.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.credit_bot_wallet(uuid,text[],text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.credit_bot_wallet(uuid,text[],text,text,boolean) TO service_role;