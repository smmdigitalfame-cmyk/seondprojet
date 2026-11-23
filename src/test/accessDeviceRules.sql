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
  IF result->>'code' <> 'device_limit' THEN RAISE EXCEPTION 'Third device exceeded two slots'; END IF;
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
  IF has_function_privilege('anon','public.validate_and_bind_access_key(text,text)','EXECUTE') OR
    has_function_privilege('authenticated','public.validate_and_bind_access_key(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Client can claim device slots';
  END IF;
END;
$$;
ROLLBACK;