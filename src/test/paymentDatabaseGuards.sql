-- Run transactionally against the authoritative database; never mint a test key.
BEGIN;
DO $$
DECLARE o public.oxapay_orders; rejected boolean := false;
BEGIN
 IF has_table_privilege('anon','public.oxapay_orders','INSERT') OR has_table_privilege('authenticated','public.oxapay_orders','UPDATE') OR has_function_privilege('anon','public.fulfill_verified_oxapay_order(uuid,text,numeric,text,text,text)','EXECUTE') OR has_function_privilege('service_role','public.fulfill_oxapay_order(uuid,text,numeric,text)','EXECUTE') THEN RAISE EXCEPTION 'Public purchase permission bypass'; END IF;
 SELECT * INTO o FROM public.oxapay_orders WHERE status='pending' AND track_id IS NOT NULL AND access_key_id IS NULL LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending order required for negative test'; END IF;
 BEGIN
  PERFORM public.fulfill_verified_oxapay_order(o.id,o.track_id,o.amount,o.currency,o.id::text,'failed');
 EXCEPTION WHEN OTHERS THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Failed payment was accepted'; END IF;
 rejected := false;
 BEGIN
  UPDATE public.oxapay_orders SET duration_days=999 WHERE id=o.id;
 EXCEPTION WHEN OTHERS THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Duration tampering was accepted'; END IF;
 rejected := false;
 BEGIN
  UPDATE public.oxapay_orders SET status='paid' WHERE id=o.id;
 EXCEPTION WHEN OTHERS THEN rejected := true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Unverified paid flag was accepted'; END IF;
 IF EXISTS (SELECT 1 FROM public.oxapay_orders WHERE id=o.id AND (status<>'pending' OR access_key_id IS NOT NULL OR payment_verified_at IS NOT NULL)) THEN RAISE EXCEPTION 'Unpaid order acquired access'; END IF;
END; $$;
ROLLBACK;