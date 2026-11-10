import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { verifyOxaPaySignature } from './verification.ts';
import { paymentDb, verifyAndFulfill } from '../_shared/public-payments.ts';

Deno.serve(async (req: Request) => {
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers });
  if (Deno.env.get('SUPABASE_URL')?.includes('ircfmtprrwggcbmrvmnt')) {
    const upstream = await fetch('https://xkgjifugwislpbczoduy.supabase.co/functions/v1/oxapay-callback', { method: 'POST', headers: { HMAC: req.headers.get('HMAC') ?? '', 'Content-Type': 'application/json' }, body: await req.arrayBuffer() });
    return new Response(await upstream.text(), { status: upstream.status, headers });
  }
  const signature = req.headers.get('HMAC');
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers });
  }
  const merchantKey = Deno.env.get('OXAPAY_MERCHANT_API_KEY');
  if (!merchantKey) return new Response(JSON.stringify({ error: 'Payment setup pending' }), { status: 503, headers });
  try {
    const body = new Uint8Array(await req.arrayBuffer());
    if (body.byteLength > 65536) return new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413, headers });
    if (!await verifyOxaPaySignature(body, signature, merchantKey)) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers });
    }
    const payload = JSON.parse(new TextDecoder().decode(body));
    if (!payload || typeof payload !== 'object' || !['string', 'number'].includes(typeof payload.track_id) || typeof payload.status !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid payment update' }), { status: 400, headers });
    }
    const { data: order, error } = await paymentDb().from('oxapay_orders').select('id').eq('track_id', String(payload.track_id)).maybeSingle();
    if (error || !order) return new Response(JSON.stringify({ error: 'Unknown invoice' }), { status: 400, headers });
    await verifyAndFulfill(order.id);
    return new Response('ok', { headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Payment processing failed; retry required' }), { status: 503, headers });
  }
});