CREATE TABLE public.public_bot_users (telegram_chat_id text PRIMARY KEY, first_seen_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.public_bot_users TO service_role;
ALTER TABLE public.public_bot_users ENABLE ROW LEVEL SECURITY;
INSERT INTO public.public_bot_users(telegram_chat_id,first_seen_at) SELECT telegram_chat_id,min(created_at) FROM public.oxapay_orders GROUP BY telegram_chat_id ON CONFLICT DO NOTHING;
CREATE TABLE public.public_bot_notifications (event_id text PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('user','sale')),payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,claim_token uuid,claimed_at timestamptz);
GRANT ALL ON public.public_bot_notifications TO service_role;
ALTER TABLE public.public_bot_notifications ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.record_public_bot_event(p_kind text,p_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE added integer; o public.oxapay_orders; payload jsonb;
BEGIN
 IF p_kind='user' THEN
  IF p_id !~ '^[0-9]{1,20}$' THEN RAISE EXCEPTION 'Invalid chat'; END IF;
  INSERT INTO public.public_bot_users(telegram_chat_id) VALUES(p_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS added=ROW_COUNT;
  IF added=0 THEN RETURN; END IF;
  payload=jsonb_build_object('chat_id',p_id);
 ELSIF p_kind='sale' THEN
  SELECT * INTO o FROM public.oxapay_orders WHERE id=p_id::uuid AND status='paid';
  IF NOT FOUND THEN RETURN; END IF;
  payload=jsonb_build_object('chat_id',o.telegram_chat_id,'product',o.product,'plan',o.plan_id,'amount',o.amount,'order_id',o.id);
 ELSE RAISE EXCEPTION 'Invalid event'; END IF;
 INSERT INTO public.public_bot_notifications(event_id,kind,payload) VALUES(p_kind||':'||p_id,p_kind,payload) ON CONFLICT DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.record_public_bot_event(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_public_bot_event(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_public_bot_notifications() RETURNS SETOF public.public_bot_notifications LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.public_bot_notifications SET claim_token=gen_random_uuid(),claimed_at=now() WHERE event_id IN (SELECT event_id FROM public.public_bot_notifications WHERE delivered_at IS NULL AND (claimed_at IS NULL OR claimed_at<now()-interval '5 minutes') ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_public_bot_notifications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_public_bot_notifications() TO service_role;
CREATE OR REPLACE FUNCTION public.public_bot_totals() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('users',(SELECT count(*) FROM public.public_bot_users),'sales',count(*),'revenue',coalesce(sum(amount),0),'instagram',count(*) FILTER(WHERE product='instagram'),'tiktok',count(*) FILTER(WHERE product='tiktok')) FROM public.oxapay_orders WHERE status='paid';
$$;
REVOKE ALL ON FUNCTION public.public_bot_totals() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.public_bot_totals() TO service_role;