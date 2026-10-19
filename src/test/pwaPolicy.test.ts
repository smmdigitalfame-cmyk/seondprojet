import { describe, expect, it } from "vitest";
import { canRegisterAppWorker } from "../lib/pwaPolicy";

describe("app worker registration", () => {
  it("allows the existing production Vercel app", () => {
    expect(canRegisterAppWorker(true, "seondprojet.vercel.app", false, "")).toBe(true);
  });
  it("never registers in development", () => {
    expect(canRegisterAppWorker(false, "localhost", false, "")).toBe(false);
  });
  it.each(["id-preview--example.lovable.app", "preview--example.lovable.app", "lovableproject.com", "a.lovableproject.com", "lovableproject-dev.com", "a.lovableproject-dev.com", "beta.lovable.dev", "a.beta.lovable.dev"])("never registers on preview host %s", (hostname) => {
    expect(canRegisterAppWorker(true, hostname, false, "")).toBe(false);
  });
  it("never registers inside an iframe", () => {
    expect(canRegisterAppWorker(true, "seondprojet.vercel.app", true, "")).toBe(false);
  });
  it("honors the explicit worker kill switch", () => {
    expect(canRegisterAppWorker(true, "seondprojet.vercel.app", false, "?sw=off")).toBe(false);
  });
});