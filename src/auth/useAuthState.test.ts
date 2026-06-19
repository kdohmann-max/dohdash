import { describe, expect, test } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { deriveAuthState } from "./useAuthState";
import type { Profile } from "../storage/db";

function fakeSession(): Session {
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "user-1", email: "person@example.com" },
  } as unknown as Session;
}

function fakeProfile(): Profile {
  return {
    id: "user-1",
    email: "person@example.com",
    displayName: "Person",
    avatarUrl: null,
    role: "member",
    createdAt: 0,
    tenantId: "tenant-built",
  };
}

describe("deriveAuthState", () => {
  test("outcome not yet resolved -> loading", () => {
    const session = fakeSession();
    expect(deriveAuthState(session, null)).toEqual({ status: "loading" });
  });

  test("profile found -> authenticated", () => {
    const session = fakeSession();
    const profile = fakeProfile();
    expect(deriveAuthState(session, { kind: "found", profile })).toEqual({
      status: "authenticated",
      session,
      profile,
    });
  });

  test("no profile row (PGRST116) -> pending-access, not error", () => {
    const session = fakeSession();
    expect(deriveAuthState(session, { kind: "not-found" })).toEqual({
      status: "pending-access",
      session,
    });
  });

  test("profile fetch failure -> error, distinct from pending-access", () => {
    const session = fakeSession();
    expect(deriveAuthState(session, { kind: "error", message: "network down" })).toEqual({
      status: "error",
      message: "network down",
    });
  });

  test("profile found on matching host tenant -> authenticated", () => {
    const session = fakeSession();
    const profile = fakeProfile(); // tenantId: "tenant-built"
    expect(deriveAuthState(session, { kind: "found", profile }, "tenant-built")).toEqual({
      status: "authenticated",
      session,
      profile,
    });
  });

  test("profile from a different tenant than the host -> signed-out", () => {
    const session = fakeSession();
    const profile = fakeProfile(); // tenantId: "tenant-built"
    expect(deriveAuthState(session, { kind: "found", profile }, "tenant-acme")).toEqual({
      status: "signed-out",
    });
  });

  test("unresolved host tenant (null) -> membership check skipped (authenticated)", () => {
    const session = fakeSession();
    const profile = fakeProfile();
    expect(deriveAuthState(session, { kind: "found", profile }, null)).toEqual({
      status: "authenticated",
      session,
      profile,
    });
  });
});
