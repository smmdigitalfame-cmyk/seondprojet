CREATE OR REPLACE FUNCTION public.validate_and_bind_access_key(p_key text, p_device_fp text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.access_keys%ROWTYPE; fps text[];
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
  IF NOT p_device_fp = ANY(fps) THEN
    IF cardinality(fps) >= greatest(coalesce(r.max_devices, 1), 1) THEN
      RETURN jsonb_build_object('valid', false, 'code', 'device_limit', 'error', 'Device limit reached. Log out on another device first.');
    END IF;
    UPDATE public.access_keys SET device_fingerprints = array_append(fps, p_device_fp), last_seen_at = now(), updated_at = now() WHERE id = r.id;
  ELSIF r.last_seen_at IS NULL OR r.last_seen_at < now() - interval '10 minutes' THEN
    UPDATE public.access_keys SET last_seen_at = now() WHERE id = r.id;
  END IF;
  RETURN jsonb_build_object('valid', true, 'label', r.label, 'expires_at', r.expires_at, 'max_devices', r.max_devices);
END;
$$;
REVOKE ALL ON FUNCTION public.validate_and_bind_access_key(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_bind_access_key(text, text) TO service_role;