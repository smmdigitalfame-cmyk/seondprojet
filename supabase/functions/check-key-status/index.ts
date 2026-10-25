import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    if (primary && primary.status < 500 && !/"invalid_key"/.test(primary.text) && primary.status !== 400) {
      return new Response(primary.text, {
        status: primary.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { key, deviceFingerprint } = JSON.parse(raw || "{}");
    const normalizedKey = String(key || "").trim().toUpperCase();
    const normalizedFp = String(deviceFingerprint || "").trim();

    if (!normalizedKey || !/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalizedKey)) {
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    try {
      await supabase.rpc("deactivate_expired_access_keys");
    } catch {
      // Best-effort cleanup; the direct expiry check below remains authoritative.
    }

    const { data: row, error } = await supabase
      .from("access_keys")
      .select("id, active, expires_at, device_fingerprints, max_devices, label, last_seen_at, legacy, legacy_checked_at")
      .eq("key", normalizedKey)
      .maybeSingle();

    if (error || !row) {
      // Migrate keys issued by the previous app backend. The old system stays
      // the authority for the original plan's validity and device limit.
      const lj = await legacyCheck(normalizedKey, normalizedFp);
      console.log("legacy import check", normalizedKey.slice(0, 4), lj.status);
      if (lj.status === "valid" || lj.status === "device_limit") {
        const exp = lj.expiresAt;
        const nowIso = new Date().toISOString();
        await supabase.from("access_keys").insert({
          key: normalizedKey,
          label: lj.label || "Migrated",
          active: true,
          expires_at: exp,
          max_devices: Math.max(1, lj.maxDevices || 1),
          device_fingerprints: [normalizedFp],
          last_seen_at: nowIso,
          legacy: true,
          legacy_checked_at: nowIso,
        });
        return json({ valid: true, label: lj.label || "Migrated", expires_at: exp });
      }
      if (lj.status === "expired") return json({ valid: false, code: "expired", error: "This key has expired." }, 403);
      if (lj.status === "deactivated") return json({ valid: false, code: "deactivated", error: "This key has been deactivated." }, 403);
      return json({ valid: false, code: "invalid_key", error: "Invalid access key." }, 404);
    }

    if (!row.active) {
      return json({ valid: false, code: "deactivated", error: "This key has been deactivated." }, 403);
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return json({ valid: false, code: "expired", error: "This key has expired." }, 403);
    }

    // Migrated keys: periodically re-ask the old system so the original
    // plan's end date / revocation is enforced even without a stored expiry.
    if (row.legacy) {
      const lastChecked = row.legacy_checked_at ? new Date(row.legacy_checked_at).getTime() : 0;
      if (Date.now() - lastChecked > 15 * 60 * 1000) {
        const fps0: string[] = Array.isArray(row.device_fingerprints) ? row.device_fingerprints : [];
        const lj = await legacyCheck(normalizedKey, fps0.includes(normalizedFp) ? normalizedFp : (fps0[0] || normalizedFp));
        console.log("legacy recheck", normalizedKey.slice(0, 4), lj.status);
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
          if (lj.expiresAt && !row.expires_at) patch.expires_at = lj.expiresAt;
          if (lj.maxDevices && lj.maxDevices > (row.max_devices || 1)) patch.max_devices = lj.maxDevices;
          await supabase.from("access_keys").update(patch).eq("id", row.id);
          if (patch.max_devices) row.max_devices = patch.max_devices as number;
        }
      }
    }


    // Device fingerprint check
    const fingerprints: string[] = Array.isArray(row.device_fingerprints) ? row.device_fingerprints : [];
    const nowIso = new Date().toISOString();
    let maxDevices = row.max_devices || 1;

    if (!fingerprints.includes(normalizedFp)) {
      if (fingerprints.length >= maxDevices) {
        // Migrated multi-device plans: the old system knows how many devices
        // the original plan allowed. If it accepts this device, open a slot.
        let legacyAllowed = false;
        if (row.legacy) {
          const lj = await legacyCheck(normalizedKey, normalizedFp);
          console.log("legacy device check", normalizedKey.slice(0, 4), lj.status);
          if (lj.status === "valid") {
            legacyAllowed = true;
            maxDevices = Math.max(maxDevices + 1, lj.maxDevices || 0);
            await supabase.from("access_keys").update({ max_devices: maxDevices }).eq("id", row.id);
          }
        }

        // A device fingerprint can change when the user clears browser data,
        // updates the OS/browser, or reinstalls the PWA. If no device has used
        // this key recently, treat the new fingerprint as the same user coming
        // back and re-bind the slot instead of locking a paid key out.
        const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
        const staleMs = 6 * 60 * 60 * 1000;
        const isStale = !lastSeen || Date.now() - lastSeen > staleMs;

        if (!legacyAllowed && !isStale) {
          return json({
            valid: false,
            code: "device_limit",
            error: `Ye key pehle se doosre device par login hai. Wahan se logout karo, phir yahan login karo.`,
          }, 403);
        }

        // Rotate the oldest slot onto this device.
        if (!legacyAllowed) fingerprints.shift();
      }


      fingerprints.push(normalizedFp);
      await supabase
        .from("access_keys")
        .update({
          device_fingerprints: fingerprints.slice(-maxDevices),
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", row.id);
    } else {
      // Throttled heartbeat so we know when the licensed device was last active.
      const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
      if (!lastSeen || Date.now() - lastSeen > 10 * 60 * 1000) {
        await supabase
          .from("access_keys")
          .update({ last_seen_at: nowIso })
          .eq("id", row.id);
      }
    }

    return new Response(JSON.stringify({ valid: true, label: row.label, expires_at: row.expires_at }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
