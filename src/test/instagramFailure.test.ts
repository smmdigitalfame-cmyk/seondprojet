import { describe, expect, it } from "vitest";
import { instagramFailureMessage } from "../lib/instagramFailure";
import { unavailableResult } from "../../supabase/functions/instagram-scraper/resultStatus";

describe("Instagram upstream failure classification", () => {
  it("reports no usable provider results as a temporary outage, not missing", () => {
    expect(unavailableResult("lowtappedd")).toMatchObject({
      status: 503, body: { error: "provider_unavailable" },
    });
  });
  it("does not treat a legacy empty scrape as a confirmed missing account", () => {
    expect(instagramFailureMessage(404, '{"error":"not_found"}', "lowtappedd"))
      .toContain("temporarily unavailable");
  });
  it("does not classify a provider's not-found text in a 502 as a private profile", () => {
    expect(instagramFailureMessage(502, 'upstream application not found', "lowtappedd"))
      .toContain("temporarily unavailable");
  });
  it("keeps explicit private account confirmation distinct", () => {
    expect(instagramFailureMessage(403, '{"error":"account_private"}', "lowtappedd"))
      .toBe("Account @lowtappedd is private.");
  });
});