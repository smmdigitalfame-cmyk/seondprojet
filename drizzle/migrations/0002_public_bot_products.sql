ALTER TABLE public.oxapay_orders ADD COLUMN product text NOT NULL DEFAULT 'instagram', ADD COLUMN external_key_code text, ADD COLUMN external_key_expires_at timestamptz;
ALTER TABLE public.oxapay_orders ADD CONSTRAINT oxapay_product_valid CHECK (product IN ('instagram','tiktok'));
CREATE OR REPLACE FUNCTION public.fulfill_oxapay_order(p_order_id uuid, p_track_id text, p_amount numeric, p_currency text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.oxapay_orders; k uuid; value text;
BEGIN
 SELECT * INTO o FROM public.oxapay_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.track_id IS DISTINCT FROM p_track_id OR o.amount IS DISTINCT FROM p_amount OR o.currency IS DISTINCT FROM upper(p_currency) THEN RAISE EXCEPTION 'Payment mismatch'; END IF;
 IF NOT ((o.plan_id='day' AND o.amount=1 AND o.duration_days=1) OR (o.plan_id='week' AND o.amount=5 AND o.duration_days=7) OR (o.plan_id='month' AND o.amount=10 AND o.duration_days=30) OR (o.plan_id='lifetime' AND o.amount=25 AND o.duration_days IS NULL)) OR o.currency <> 'USD' THEN RAISE EXCEPTION 'Invalid plan'; END IF;
 IF o.product='tiktok' THEN UPDATE public.oxapay_orders SET status='paid' WHERE id=o.id; RETURN NULL; END IF;
 IF o.access_key_id IS NOT NULL THEN RETURN o.access_key_id; END IF;
 value := upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,4)||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,4));
 INSERT INTO public.access_keys(key,label,active,expires_at,max_devices,telegram_chat_id) VALUES(value,'Public bot '||o.plan_id,true,CASE WHEN o.duration_days IS NULL THEN NULL ELSE now()+make_interval(days=>o.duration_days) END,1,o.telegram_chat_id) RETURNING id INTO k;
 UPDATE public.oxapay_orders SET access_key_id=k,status='paid' WHERE id=o.id; RETURN k;
END; $$;
REVOKE ALL ON FUNCTION public.fulfill_oxapay_order(uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_oxapay_order(uuid,text,numeric,text) TO service_role;
CREATE OR REPLACE FUNCTION public.save_tiktok_order_key(p_order_id uuid,p_key_code text,p_expires_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.oxapay_orders;
BEGIN
 SELECT * INTO o FROM public.oxapay_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.product<>'tiktok' OR o.status<>'paid' OR p_key_code !~ '^TT-[A-F0-9]{20}$' OR (o.plan_id='lifetime' AND p_expires_at IS NOT NULL) OR (o.plan_id<>'lifetime' AND p_expires_at IS NULL) THEN RAISE EXCEPTION 'Invalid fulfillment'; END IF;
 IF o.external_key_code IS NOT NULL THEN
 IF o.external_key_code IS DISTINCT FROM p_key_code OR o.external_key_expires_at IS DISTINCT FROM p_expires_at THEN RAISE EXCEPTION 'Key conflict'; END IF;
 RETURN;
 END IF;
 UPDATE public.oxapay_orders SET external_key_code=p_key_code,external_key_expires_at=p_expires_at WHERE id=o.id;
END; $$;
REVOKE ALL ON FUNCTION public.save_tiktok_order_key(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_tiktok_order_key(uuid,text,timestamptz) TO service_role;