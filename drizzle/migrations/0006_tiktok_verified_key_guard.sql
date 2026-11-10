CREATE OR REPLACE FUNCTION public.save_tiktok_order_key(p_order_id uuid,p_key_code text,p_expires_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.oxapay_orders;
BEGIN
 SELECT * INTO o FROM public.oxapay_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.product<>'tiktok' OR o.status<>'paid' OR o.payment_verified_at IS NULL OR p_key_code IS NULL OR p_key_code !~ '^TT-[A-F0-9]{20}$' OR (o.plan_id='lifetime' AND p_expires_at IS NOT NULL) OR (o.plan_id<>'lifetime' AND p_expires_at IS NULL) THEN RAISE EXCEPTION 'Verified payment required'; END IF;
 IF o.external_key_code IS NOT NULL THEN
  IF o.external_key_code IS DISTINCT FROM p_key_code OR o.external_key_expires_at IS DISTINCT FROM p_expires_at THEN RAISE EXCEPTION 'Key conflict'; END IF;
  RETURN;
 END IF;
 UPDATE public.oxapay_orders SET external_key_code=p_key_code,external_key_expires_at=p_expires_at WHERE id=o.id;
END; $$;
REVOKE ALL ON FUNCTION public.save_tiktok_order_key(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_tiktok_order_key(uuid,text,timestamptz) TO service_role;