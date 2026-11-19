ALTER TABLE public.oxapay_orders ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'oxapay' CHECK (payment_provider IN ('oxapay','binance'));
CREATE TABLE public.binance_checkouts (order_id uuid PRIMARY KEY REFERENCES public.oxapay_orders(id),payment_usdt numeric(24,8) NOT NULL UNIQUE CHECK(payment_usdt>0),submitted_id text,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','review','paid','rejected')),created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.binance_checkouts TO service_role;
ALTER TABLE public.binance_checkouts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.binance_subscription_claims(alias text PRIMARY KEY,order_id uuid NOT NULL REFERENCES public.oxapay_orders(id));
GRANT ALL ON public.binance_subscription_claims TO service_role;
ALTER TABLE public.binance_subscription_claims ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.fulfill_binance_subscription(p_order_id uuid,p_aliases text[],p_amount numeric,p_verified boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.oxapay_orders; c public.binance_checkouts; a text; claimed uuid; k uuid;
BEGIN
SELECT * INTO o FROM public.oxapay_orders WHERE id=p_order_id FOR UPDATE;
SELECT * INTO c FROM public.binance_checkouts WHERE order_id=p_order_id FOR UPDATE;
IF o.id IS NULL OR c.order_id IS NULL OR o.payment_provider<>'binance' OR NOT coalesce(p_verified,false) OR p_amount IS NULL OR p_amount<=0 OR p_amount<>c.payment_usdt OR p_amount<o.amount*.99 OR c.submitted_id IS NULL OR array_length(p_aliases,1) IS NULL OR NOT(c.submitted_id=ANY(p_aliases)) OR c.status='rejected' THEN RAISE EXCEPTION 'Unverified Binance receipt'; END IF;
FOR a IN SELECT DISTINCT unnest(p_aliases) ORDER BY 1 LOOP
IF a IS NULL OR length(a)<1 OR length(a)>128 THEN RAISE EXCEPTION 'Invalid receipt identity'; END IF;
IF EXISTS(SELECT 1 FROM public.bot_wallet_transaction_claims WHERE alias=a) THEN RAISE EXCEPTION 'Receipt already used'; END IF;
INSERT INTO public.binance_subscription_claims VALUES(a,o.id) ON CONFLICT DO NOTHING;
SELECT order_id INTO claimed FROM public.binance_subscription_claims WHERE alias=a;
IF claimed IS DISTINCT FROM o.id THEN RAISE EXCEPTION 'Receipt already used'; END IF;
END LOOP;
k:=public.fulfill_verified_oxapay_order(o.id,o.track_id,o.amount,o.currency,o.id::text,'paid');
UPDATE public.binance_checkouts SET status='paid' WHERE order_id=o.id;
RETURN k;
END $$;
REVOKE ALL ON FUNCTION public.fulfill_binance_subscription(uuid,text[],numeric,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_binance_subscription(uuid,text[],numeric,boolean) TO service_role;