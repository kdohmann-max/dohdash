import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, getProfile, type Profile } from "../storage/db";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "pending-access"; session: Session }
  | { status: "authenticated"; session: Session; profile: Profile }
  | { status: "error"; message: string };

type ProfileOutcome =
  | { kind: "found"; profile: Profile }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/**
 * Pure mapping from "session + profile-fetch outcome" to AuthState. Kept
 * separate from the hook so it can be unit-tested with synthetic inputs —
 * no React or Supabase wiring needed to exercise every transition,
 * including the not-found-vs-error branch that getProfile's PGRST116
 * handling makes possible.
 */
export function deriveAuthState(session: Session, outcome: ProfileOutcome | null): AuthState {
  if (outcome === null) return { status: "loading" };
  switch (outcome.kind) {
    case "found":
      return { status: "authenticated", session, profile: outcome.profile };
    case "not-found":
      return { status: "pending-access", session };
    case "error":
      return { status: "error", message: outcome.message };
  }
}

export const REDIRECT_STORAGE_KEY = "dohdash:redirect";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useAuthState() {
  // undefined = initial sign-in status not yet known; null = signed out
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profileState, setProfileState] = useState<{ userId: string; outcome: ProfileOutcome } | null>(null);

  // Single source of truth: onAuthStateChange fires INITIAL_SESSION immediately
  // with whatever session currently exists (or null), plus every subsequent
  // SIGNED_IN/SIGNED_OUT/TOKEN_REFRESHED change. A separate getSession() call
  // would race this — deliberately not used (see plan §4).
  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (userId === null) return;

    let cancelled = false;
    getProfile(userId)
      .then((profile) => {
        if (cancelled) return;
        setProfileState({ userId, outcome: profile ? { kind: "found", profile } : { kind: "not-found" } });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProfileState({ userId, outcome: { kind: "error", message: errorMessage(err) } });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const state = useMemo<AuthState>(() => {
    if (session === undefined) return { status: "loading" };
    if (session === null) return { status: "signed-out" };
    // Tag profileState with the userId it resolves so a stale fetch from a
    // just-signed-out-then-back-in user can never be mistaken for the
    // current one.
    const outcome = profileState && profileState.userId === session.user.id ? profileState.outcome : null;
    return deriveAuthState(session, outcome);
  }, [session, profileState]);

  async function signInWithGoogle() {
    // Stash the destination before the OAuth round-trip so AuthGate can
    // restore it afterwards — fixes the lost-deep-link problem (see plan §4).
    sessionStorage.setItem(REDIRECT_STORAGE_KEY, window.location.pathname + window.location.search);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return { state, signInWithGoogle, signOut };
}
