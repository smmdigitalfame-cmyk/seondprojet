export async function verifyOxaPaySignature(body: Uint8Array, signature: string | null, merchantKey: string): Promise<boolean> {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(merchantKey), { name: "HMAC", hash: "SHA-512" }, false, ["verify"],
  );
  const bytes = new Uint8Array(signature.match(/.{2}/g)?.map((part) => parseInt(part, 16)) ?? []);
  return crypto.subtle.verify("HMAC", key, bytes, new Uint8Array(body));
}