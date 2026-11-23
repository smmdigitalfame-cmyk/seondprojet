import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInstagramAccessKey } from '../_shared/access-key-format.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type LegacyResult = {
  status: "valid" | "device_limit" | "expired" | "deactivated" | "invalid" | "unknown";
  label?: string;
  expiresAt: string | null;
  maxDevices?: number;
};

// Previous app backend that issued the older paid keys.
const LEGACY_URL = "https://phtlqnljsnwzzqcnmnoz.supabase.co/functions/v1/check-key-status";

async function legacyCheck(key: string, fp: string): Promise<LegacyResult> {
  try {
    const res = await fetch(LEGACY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, deviceFingerprint: fp }),
      signal: AbortSignal.timeout(8000),
    });
    const lj = await res.json().catch(() => ({} as any));
    if (res.status >= 500 || res.status === 429) return { status: "unknown", expiresAt: null };
    const expiresAt = lj?.expires_at ?? lj?.expiresAt ?? null;
    const maxRaw = Number(lj?.max_devices ?? lj?.maxDevices ?? 0);
    const maxDevices = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(maxRaw, 20) : undefined;
    const base = { label: lj?.label, expiresAt, maxDevices };
    if (res.ok && lj?.valid === true) return { status: "valid", ...base };
    const code = String(lj?.code || "").toLowerCase();
    const msg = String(lj?.error || "").toLowerCase();
    if (code === "device_limit" || /device/.test(msg)) return { status: "device_limit", ...base };
    if (code === "expired" || /expired/.test(msg)) return { status: "expired", ...base };
    if (code === "deactivated" || /deactivat|revok/.test(msg)) return { status: "deactivated", ...base };
    if (code === "invalid_key" || res.status === 404 && /invalid/.test(msg)) return { status: "invalid", ...base };
    return { status: "unknown", expiresAt: null };
  } catch {
    return { status: "unknown", expiresAt: null };
  }
}


// Live key server (the one the Telegram bot writes to). It is the source of
// truth for keys, so every app URL (Lovable + Vercel) accepts the same keys.
const PRIMARY_KEY_SERVER = "https://xkgjifugwislpbczoduy.supabase.co/functions/v1/";

async function forwardToPrimary(name: string, raw: string): Promise<{ status: number; text: string } | null> {
  if (Deno.env.get("SUPABASE_URL")?.includes("xkgjifugwislpbczoduy")) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(PRIMARY_KEY_SERVER + name, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return { status: res.status, text: await res.text() };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const raw = await req.text();
    const primary = await forwardToPrimary("check-key-status", raw);
    // Never consult a stale replica after the authoritative service times out.
    if (!Deno.env.get("SUPABASE_URL")?.includes("xkgjifugwislpbczoduy") && (!primary || primary.status >= 500)) {
      return json({ valid: false, code: "verification_unavailable", error: "Verification temporarily unavailable." }, 503);
    }
    if (primary && primary.status < 500 && !/"invalid_key"/.test(primary.text) && primary.status !== 400) {
      return new Response(primary.text, {
        status: primary.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { key, deviceFingerprint } = JSON.parse(raw || "{}");
    const normalizedKey = String(key || "").trim().toUpperCase();
    const normalizedFp = String(deviceFingerprint || "").trim();

    if (!isInstagramAccessKey(normalizedKey)) {
      return new Response(JSON.stringify({ valid: false, error: "Missing key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!normalizedFp || normalizedFp.length > 128) {
      return new Response(JSON.stringify({ valid: false, error: "Device verification required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ valid: false, error: 'Verification temporarily unavailable' }, 503);
    const supabase = createClient(url, serviceKey);

    const { data: row, error } = await supabase
      .from("access_keys")
      .select("id, active, expires_at, device_fingerprints, max_devices, label, last_seen_at, legacy, legacy_checked_at")
      .eq("key", normalizedKey)
      .maybeSingle();

    if (error) return json({ valid: false, code: "verification_unavailable", error: "Verification temporarily unavailable." }, 503);
    if (!row) {
      // Migrate keys issued by the previous app backend. The old system stays
      // the authority for the original plan's validity and device limit.
      const lj = await legacyCheck(normalizedKey, normalizedFp);
      if (lj.status === "device_limit") return json({ valid: false, code: "device_limit", error: "Device limit reached. Log out on another device first." }, 403);
      if (lj.status === "valid") {
        const exp = lj.expiresAt;
        const nowIso = new Date().toISOString();
        const { error: importError } = await supabase.from("access_keys").upsert({
          key: normalizedKey,
          label: lj.label || "Migrated",
          active: true,
          expires_at: exp,
          max_devices: Math.max(1, lj.maxDevices || 1),
          device_fingerprints: [],
          last_seen_at: nowIso,
          legacy: true,
          legacy_checked_at: nowIso,
        }, { onConflict: "key", ignoreDuplicates: true });
        if (importError) return json({ valid: false, code: "verification_unavailable", error: "Verification temporarily unavailable." }, 503);
        const { data, error: bindError } = await supabase.rpc("validate_and_bind_access_key", { p_key: normalizedKey, p_device_fp: normalizedFp });
        if (bindError || !data) return json({ valid: false, code: "verification_unavailable", error: "Verification temporarily unavailable." }, 503);
        return json(data, data.valid ? 200 : 403);
      }
      if (lj.status === "expired") return json({ valid: false, code: "expired", error: "This key has expired." }, 403);
      if (lj.status === "deactivated") return json({ valid: false, code: "deactivated", error: "This key has been deactivated." }, 403);
      if (lj.status === "invalid") return json({ valid: false, code: "invalid_key", error: "Invalid access key." }, 404);
      return json({ valid: false, code: "verification_unavailable", error: "Verification temporarily unavailable." }, 503);
    }

    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return json({ valid: false, code: "expired", error: "This key has expired." }, 403);
    }
    if (!row.active) {
      return json({ valid: false, code: "deactivated", error: "This key has been deactivated." }, 403);
    }

    // Migrated keys: periodically re-ask the old system so the original
    // plan's end date / revocation is enforced even without a stored expiry.
    if (row.legacy) {
      const lastChecked = row.legacy_checked_at ? new Date(row.legacy_checked_at).getTime() : 0;
      if (Date.now() - lastChecked > 15 * 60 * 1000) {
        const fps0: string[] = Array.isArray(row.device_fingerprints) ? row.device_fingerprints : [];
        const lj = await legacyCheck(normalizedKey, fps0.includes(normalizedFp) ? normalizedFp : (fps0[0] || normalizedFp));
        const nowIso = new Date().toISOString();
        if (lj.status === "expired" || lj.status === "deactivated") {
          await supabase.from("access_keys").update({
            active: false, legacy_checked_at: nowIso, updated_at: nowIso,
            expires_at: lj.status === "expired" ? (lj.expiresAt || nowIso) : row.expires_at,
          }).eq("id", row.id);
          return json({
            valid: false,
            code: lj.status,
            error: lj.status === "expired" ? "This key has expired." : "This key has been deactivated.",
          }, 403);
        }
        if (lj.status !== "unknown") {
          const patch: Record<string, unknown> = { legacy_checked_at: nowIso };
          if (lj.expiresAt) patch.expires_at = lj.expiresAt;
          if (lj.maxDevices) patch.max_devices = lj.maxDevices;
          await supabase.from("access_keys").update(patch).eq("id", row.id);
          if (patch.max_devices) row.max_devices = patch.max_devices as number;
        }
      }
    }


    // Lock the row while checking expiry/revocation and claiming a device slot.
    // Never evict another licensed phone or increase the purchased slot count.
    const { data, error: bindError } = await supabase.rpc("validate_and_bind_access_key", { p_key: normalizedKey, p_device_fp: normalizedFp });
    if (bindError || !data) return json({ valid: false, code: "verification_unavailable", error: "Verification temporarily unavailable." }, 503);
    return json(data, data.valid ? 200 : 403);
  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
