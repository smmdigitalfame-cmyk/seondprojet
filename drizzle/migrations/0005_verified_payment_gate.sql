ALTER TABLE public.oxapay_orders ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz;
REVOKE ALL ON public.oxapay_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.oxapay_orders TO service_role;
ALTER TABLE public.oxapay_orders ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.fulfill_oxapay_order(p_order_id uuid,p_track_id text,p_amount numeric,p_currency text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Deprecated: verified provider evidence required'; END; $$;
REVOKE ALL ON FUNCTION public.fulfill_oxapay_order(uuid,text,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fulfill_verified_oxapay_order(p_order_id uuid,p_track_id text,p_amount numeric,p_currency text,p_provider_order_id text,p_provider_status text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.oxapay_orders; k uuid; value text;
BEGIN
 SELECT * INTO o FROM public.oxapay_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR p_track_id IS NULL OR p_track_id='' OR p_amount IS NULL OR p_amount<=0 OR p_provider_order_id IS DISTINCT FROM p_order_id::text OR lower(p_provider_status) IS DISTINCT FROM 'paid' OR o.track_id IS DISTINCT FROM p_track_id OR o.amount IS DISTINCT FROM p_amount OR o.currency IS DISTINCT FROM p_currency THEN RAISE EXCEPTION 'Unverified payment'; END IF;
 IF o.currency IS DISTINCT FROM 'USD' OR o.product NOT IN ('instagram','tiktok') OR NOT (CASE o.plan_id WHEN 'day' THEN o.amount=1 AND o.duration_days IS NOT DISTINCT FROM 1 WHEN 'week' THEN o.amount=5 AND o.duration_days IS NOT DISTINCT FROM 7 WHEN 'month' THEN o.amount=10 AND o.duration_days IS NOT DISTINCT FROM 30 WHEN 'lifetime' THEN o.amount=25 AND o.duration_days IS NULL ELSE false END) THEN RAISE EXCEPTION 'Invalid plan'; END IF;
 IF o.status NOT IN ('pending','paid') THEN RAISE EXCEPTION 'Invalid order state'; END IF;
 IF o.product='tiktok' THEN UPDATE public.oxapay_orders SET status='paid',payment_verified_at=coalesce(payment_verified_at,now()) WHERE id=o.id; RETURN NULL; END IF;
 IF o.access_key_id IS NOT NULL THEN UPDATE public.oxapay_orders SET status='paid',payment_verified_at=coalesce(payment_verified_at,now()) WHERE id=o.id; RETURN o.access_key_id; END IF;
 value := upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,4)||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,4));
 INSERT INTO public.access_keys(key,label,active,expires_at,max_devices,telegram_chat_id) VALUES(value,'Public bot '||o.plan_id,true,CASE WHEN o.duration_days IS NULL THEN NULL ELSE now()+make_interval(days=>o.duration_days) END,1,o.telegram_chat_id) RETURNING id INTO k;
 UPDATE public.oxapay_orders SET access_key_id=k,status='paid',payment_verified_at=now() WHERE id=o.id;
 RETURN k;
END; $$;
REVOKE ALL ON FUNCTION public.fulfill_verified_oxapay_order(uuid,text,numeric,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_verified_oxapay_order(uuid,text,numeric,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.protect_oxapay_order_terms() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF ROW(NEW.id,NEW.telegram_chat_id,NEW.telegram_update_id,NEW.product,NEW.plan_id,NEW.amount,NEW.currency,NEW.duration_days) IS DISTINCT FROM ROW(OLD.id,OLD.telegram_chat_id,OLD.telegram_update_id,OLD.product,OLD.plan_id,OLD.amount,OLD.currency,OLD.duration_days) OR (OLD.track_id IS NOT NULL AND NEW.track_id IS DISTINCT FROM OLD.track_id) OR (OLD.payment_verified_at IS NOT NULL AND NEW.payment_verified_at IS DISTINCT FROM OLD.payment_verified_at) THEN RAISE EXCEPTION 'Immutable purchase terms'; END IF;
 IF NEW.status='paid' AND NEW.payment_verified_at IS NULL AND OLD.status IS DISTINCT FROM 'paid' THEN RAISE EXCEPTION 'Payment verification required'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_oxapay_order_terms() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_oxapay_order_terms BEFORE UPDATE ON public.oxapay_orders FOR EACH ROW EXECUTE FUNCTION public.protect_oxapay_order_terms();