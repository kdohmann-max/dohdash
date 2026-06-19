import { describe, it, expect } from "vitest";
import { resolveTenantSlug } from "./tenantResolver";

describe("resolveTenantSlug", () => {
  it("reads a subdomain slug", () => {
    expect(resolveTenantSlug("built.dohdash.app")).toEqual({ kind: "subdomain", value: "built" });
  });
  it("recognizes a custom domain (not a *.dohdash.app host)", () => {
    expect(resolveTenantSlug("app.acmebuilt.com")).toEqual({ kind: "custom", value: "app.acmebuilt.com" });
  });
  it("falls back to dev tenant on localhost", () => {
    expect(resolveTenantSlug("localhost")).toEqual({ kind: "dev", value: "built" });
  });
});
