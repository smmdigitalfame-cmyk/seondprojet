CREATE TABLE public.oxapay_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), telegram_chat_id text NOT NULL, telegram_update_id bigint UNIQUE NOT NULL, plan_id text NOT NULL, amount numeric(12,2) NOT NULL, currency text NOT NULL DEFAULT 'USD', duration_days integer, track_id text UNIQUE, payment_url text, status text NOT NULL DEFAULT 'pending', access_key_id uuid REFERENCES public.access_keys(id), delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.oxapay_orders TO service_role;
ALTER TABLE public.oxapay_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_only ON public.oxapay_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE OR REPLACE FUNCTION public.fulfill_oxapay_order(p_order_id uuid, p_track_id text, p_amount numeric, p_currency text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.oxapay_orders; k uuid; value text;
BEGIN
 SELECT * INTO o FROM public.oxapay_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.track_id IS DISTINCT FROM p_track_id OR o.amount IS DISTINCT FROM p_amount OR o.currency IS DISTINCT FROM upper(p_currency) THEN RAISE EXCEPTION 'Payment mismatch'; END IF;
 IF o.access_key_id IS NOT NULL THEN RETURN o.access_key_id; END IF;
 IF NOT ((o.plan_id='day' AND o.amount=1 AND o.duration_days=1) OR (o.plan_id='week' AND o.amount=5 AND o.duration_days=7) OR (o.plan_id='month' AND o.amount=10 AND o.duration_days=30) OR (o.plan_id='lifetime' AND o.amount=25 AND o.duration_days IS NULL)) OR o.currency <> 'USD' THEN RAISE EXCEPTION 'Invalid plan'; END IF;
 value := upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,4)||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,4));
 INSERT INTO public.access_keys(key,label,active,expires_at,max_devices,telegram_chat_id) VALUES (value,'Public bot '||o.plan_id,true,CASE WHEN o.duration_days IS NULL THEN NULL ELSE now()+make_interval(days=>o.duration_days) END,1,o.telegram_chat_id) RETURNING id INTO k;
 UPDATE public.oxapay_orders SET access_key_id=k,status='paid' WHERE id=o.id;
 RETURN k;
END; $$;
REVOKE ALL ON FUNCTION public.fulfill_oxapay_order(uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_oxapay_order(uuid,text,numeric,text) TO service_role;