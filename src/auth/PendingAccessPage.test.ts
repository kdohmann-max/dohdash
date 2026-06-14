import { describe, expect, test } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { buildPendingAccessRequestInput } from "./PendingAccessPage";

function fakeSession(overrides: Record<string, unknown> = {}): Session {
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-1",
      email: "person@example.com",
      user_metadata: { full_name: "", name: "Person Name", avatar_url: "https://cdn.test/avatar.png" },
      ...overrides,
    },
  } as unknown as Session;
}

describe("buildPendingAccessRequestInput", () => {
  test("falls back to a safe display name and preserves the avatar URL", () => {
    const input = buildPendingAccessRequestInput(fakeSession());

    expect(input).toEqual({
      id: "user-1",
      email: "person@example.com",
      displayName: "Person Name",
      avatarUrl: "https://cdn.test/avatar.png",
    });
  });
});
