BEGIN;
DO $$
DECLARE k text; result jsonb; expiry timestamptz; n integer; days integer;
BEGIN
  -- Each generated duration stays exactly as stored through validation.
  FOREACH days IN ARRAY ARRAY[1,7,30] LOOP
    k := 'TEST-' || upper(substr(md5(random()::text),1,8));
    expiry := now() + make_interval(days => days);
    INSERT INTO public.access_keys(key,label,active,expires_at,max_devices,device_fingerprints)
      VALUES(k,'temporary rollback plan test',true,expiry,2,ARRAY[]::text[]);
    result := public.validate_and_bind_access_key(k,'test-phone-a');
    IF result->>'valid' <> 'true' OR (result->>'expires_at')::timestamptz <> expiry THEN RAISE EXCEPTION '% day expiry changed', days; END IF;
  END LOOP;
  k := 'TEST-' || upper(substr(md5(random()::text),1,8));
  INSERT INTO public.access_keys(key,label,active,expires_at,max_devices,device_fingerprints)
    VALUES(k,'temporary rollback lifetime test',true,NULL,2,ARRAY[]::text[]);
  result := public.validate_and_bind_access_key(k,'test-phone-a');
  IF result->>'valid' <> 'true' OR result->>'expires_at' IS NOT NULL THEN RAISE EXCEPTION 'Lifetime acquired an expiry'; END IF;
  result := public.validate_and_bind_access_key(k,'test-phone-b');
  IF result->>'valid' <> 'true' THEN RAISE EXCEPTION 'Second purchased slot rejected'; END IF;
  result := public.validate_and_bind_access_key(k,'test-phone-c');
  IF result->>'code' <> 'device_limit' THEN RAISE EXCEPTION 'Third device took a slot from phones in use'; END IF;
  result := public.validate_and_bind_access_key(k,'test-phone-a');
  IF result->>'valid' <> 'true' THEN RAISE EXCEPTION 'Existing device was evicted'; END IF;
  SELECT cardinality(device_fingerprints) INTO n FROM public.access_keys WHERE key=k;
  IF n <> 2 THEN RAISE EXCEPTION 'Duplicate device consumed extra slot'; END IF;
  result := public.logout_access_key_device(k,'test-phone-a');
  IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'Logout did not free only requested slot'; END IF;
  result := public.validate_and_bind_access_key(k,'test-phone-b');
  IF result->>'valid' <> 'true' THEN RAISE EXCEPTION 'Logout evicted another phone'; END IF;
  result := public.validate_and_bind_access_key(k,'test-phone-c');
  IF result->>'valid' <> 'true' THEN RAISE EXCEPTION 'Freed slot cannot be reused'; END IF;
  IF EXISTS(SELECT 1 FROM public.access_keys WHERE key=k AND (NOT active OR expires_at IS NOT NULL OR max_devices<>2)) THEN RAISE EXCEPTION 'Logout changed purchased terms'; END IF;
  UPDATE public.access_keys SET expires_at=now()-interval '1 second', active=false WHERE key=k;
  result := public.validate_and_bind_access_key(k,'test-phone-a');
  IF result->>'code' <> 'expired' THEN RAISE EXCEPTION 'Expired access mislabeled revoked'; END IF;
  UPDATE public.access_keys SET expires_at=NULL, active=false WHERE key=k;
  result := public.validate_and_bind_access_key(k,'test-phone-a');
  IF result->>'code' <> 'deactivated' THEN RAISE EXCEPTION 'Revoked access allowed'; END IF;
  -- A phone unused for 30+ minutes hands its slot to a new phone; slot count stays the same.
  k := 'TEST-' || upper(substr(md5(random()::text),1,8));
  INSERT INTO public.access_keys(key,label,active,expires_at,max_devices,device_fingerprints)
    VALUES(k,'temporary rollback takeover test',true,now()+interval '7 days',1,ARRAY[]::text[]);
  result := public.validate_and_bind_access_key(k,'old-phone');
  result := public.validate_and_bind_access_key(k,'new-phone');
  IF result->>'code' <> 'device_limit' THEN RAISE EXCEPTION 'Phone in use was replaced'; END IF;
  UPDATE public.access_keys SET device_last_seen=jsonb_build_object('old-phone', now()-interval '31 minutes'), last_seen_at=now()-interval '31 minutes' WHERE key=k;
  result := public.validate_and_bind_access_key(k,'new-phone');
  IF result->>'valid' <> 'true' THEN RAISE EXCEPTION 'Unused phone kept the slot'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.access_keys WHERE key=k AND device_fingerprints=ARRAY['new-phone'] AND max_devices=1 AND active) THEN RAISE EXCEPTION 'Takeover changed slot count or terms'; END IF;
  result := public.validate_and_bind_access_key(k,'old-phone');
  IF result->>'code' <> 'device_limit' THEN RAISE EXCEPTION 'Old phone grabbed slot back immediately'; END IF;
  -- Legacy rows with no per-phone record use the key's last activity.
  UPDATE public.access_keys SET device_last_seen='{}'::jsonb, last_seen_at=now() WHERE key=k;
  result := public.validate_and_bind_access_key(k,'third-phone');
  IF result->>'code' <> 'device_limit' THEN RAISE EXCEPTION 'Recently used legacy phone replaced'; END IF;
  IF has_function_privilege('anon','public.validate_and_bind_access_key(text,text)','EXECUTE') OR
    has_function_privilege('authenticated','public.validate_and_bind_access_key(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Client can claim device slots';
  END IF;
END;
$$;
ROLLBACK;