CREATE OR REPLACE FUNCTION public.logout_access_key_device(p_key text, p_device_fp text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.access_keys%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.access_keys WHERE key=upper(trim(p_key)) FOR UPDATE;
  IF NOT FOUND OR NOT r.active OR coalesce(p_device_fp,'')='' OR NOT p_device_fp=ANY(coalesce(r.device_fingerprints,ARRAY[]::text[])) THEN
    RETURN jsonb_build_object('ok',false,'code','device_not_bound','error','Device is not signed in with this key.');
  END IF;
  UPDATE public.access_keys SET device_fingerprints=array_remove(coalesce(r.device_fingerprints,ARRAY[]::text[]),p_device_fp),last_seen_at=NULL,updated_at=now() WHERE id=r.id;
  RETURN jsonb_build_object('ok',true);
END;
$$;
REVOKE ALL ON FUNCTION public.logout_access_key_device(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.logout_access_key_device(text,text) TO service_role;