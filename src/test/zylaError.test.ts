import { describe, expect, it } from "vitest";
import { preserveZylaFailure, zylaFailure } from "../../supabase/functions/instagram-scraper/zylaError";
import { instagramFailureMessage } from "../lib/instagramFailure";

describe("ZylaLabs exhausted trial", () => {
  const message = "Your trial API calls have exceeded the allowed limit. START YOUR PAID PLAN";
  it("preserves 429 and stops instead of swallowing the trial failure", () => {
    const error = zylaFailure(429, { message, success: false });
    expect(error.status).toBe(429);
    expect(() => preserveZylaFailure(error)).toThrow(message);
  });
  it("shows the provider remedy rather than failed to fetch or private account", () => {
    expect(instagramFailureMessage(429, JSON.stringify({ error: "provider_request_failed", message }), "whop")).toBe(message);
  });
});