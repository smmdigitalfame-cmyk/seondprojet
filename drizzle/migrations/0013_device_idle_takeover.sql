ALTER TABLE public.access_keys ADD COLUMN IF NOT EXISTS device_last_seen jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.validate_and_bind_access_key(p_key text, p_device_fp text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.access_keys%ROWTYPE; fps text[]; seen jsonb; f text; stale text; stale_at timestamptz; at timestamptz;
BEGIN
  IF coalesce(length(trim(p_device_fp)), 0) = 0 OR length(p_device_fp) > 128 THEN
    RETURN jsonb_build_object('valid', false, 'code', 'device_required', 'error', 'Device verification required.');
  END IF;
  SELECT * INTO r FROM public.access_keys WHERE key = upper(trim(p_key)) FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false, 'code', 'invalid_key', 'error', 'Invalid access key.'); END IF;
  IF r.expires_at IS NOT NULL AND r.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false, 'code', 'expired', 'error', 'This key has expired.');
  END IF;
  IF NOT r.active THEN RETURN jsonb_build_object('valid', false, 'code', 'deactivated', 'error', 'This key has been revoked.'); END IF;
  fps := coalesce(r.device_fingerprints, ARRAY[]::text[]);
  seen := coalesce(r.device_last_seen, '{}'::jsonb);
  IF p_device_fp = ANY(fps) THEN
    at := nullif(seen->>p_device_fp, '')::timestamptz;
    IF at IS NULL OR at < now() - interval '10 minutes' OR r.last_seen_at IS NULL OR r.last_seen_at < now() - interval '10 minutes' THEN
      UPDATE public.access_keys SET last_seen_at = now(), device_last_seen = seen || jsonb_build_object(p_device_fp, now()) WHERE id = r.id;
    END IF;
  ELSIF cardinality(fps) < greatest(coalesce(r.max_devices, 1), 1) THEN
    UPDATE public.access_keys SET device_fingerprints = array_append(fps, p_device_fp), last_seen_at = now(),
      device_last_seen = seen || jsonb_build_object(p_device_fp, now()), updated_at = now() WHERE id = r.id;
  ELSE
    -- All purchased slots are taken. A phone unused for 30+ minutes (for example
    -- an uninstalled/reset app) hands its slot to this phone; the slot count never grows.
    FOREACH f IN ARRAY fps LOOP
      at := coalesce(nullif(seen->>f, '')::timestamptz, r.last_seen_at, r.updated_at);
      IF stale_at IS NULL OR at < stale_at THEN stale := f; stale_at := at; END IF;
    END LOOP;
    IF stale IS NULL OR stale_at > now() - interval '30 minutes' THEN
      RETURN jsonb_build_object('valid', false, 'code', 'device_limit', 'error', 'This key is in use on another phone. Log out there, or try again after 30 minutes without using it.');
    END IF;
    UPDATE public.access_keys SET device_fingerprints = array_append(array_remove(fps, stale), p_device_fp), last_seen_at = now(),
      device_last_seen = (seen - stale) || jsonb_build_object(p_device_fp, now()), updated_at = now() WHERE id = r.id;
  END IF;
  RETURN jsonb_build_object('valid', true, 'label', r.label, 'expires_at', r.expires_at, 'max_devices', r.max_devices);
END;
$$;
REVOKE ALL ON FUNCTION public.validate_and_bind_access_key(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_bind_access_key(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.logout_access_key_device(p_key text, p_device_fp text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.access_keys%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.access_keys WHERE key=upper(trim(p_key)) FOR UPDATE;
  IF NOT FOUND OR NOT r.active OR coalesce(p_device_fp,'')='' OR NOT p_device_fp=ANY(coalesce(r.device_fingerprints,ARRAY[]::text[])) THEN
    RETURN jsonb_build_object('ok',false,'code','device_not_bound','error','Device is not signed in with this key.');
  END IF;
  UPDATE public.access_keys SET device_fingerprints=array_remove(coalesce(r.device_fingerprints,ARRAY[]::text[]),p_device_fp),
    device_last_seen=coalesce(r.device_last_seen,'{}'::jsonb) - p_device_fp, last_seen_at=NULL, updated_at=now() WHERE id=r.id;
  RETURN jsonb_build_object('ok',true);
END;
$$;
REVOKE ALL ON FUNCTION public.logout_access_key_device(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.logout_access_key_device(text,text) TO service_role;