// Loads the active tenant's branding config and applies its style guide as CSS
// custom properties. Config now comes from the tenants table (resolved by
// hostname via the anon-safe get_tenant_public_config RPC) instead of the
// runtime CompanyInfo.md fetch — public/CompanyInfo.md is now just the seed
// template for tenant #1. Swapping a tenant row re-brands the app per-host.

import type { CompanyInfo } from "./types";
import { getTenantPublicConfig } from "../storage/db";
import { resolveTenantSlug } from "./tenantResolver";

export async function loadCompanyInfo(): Promise<CompanyInfo> {
  const host = window.location.hostname;
  const resolution = resolveTenantSlug(host);

  // In dev mode, pass the slug to the RPC; otherwise pass the hostname
  const lookupHost = resolution.kind === "dev" ? resolution.value : host;

  return getTenantPublicConfig(lookupHost);
}

const TENANT_THEME_STYLE_ID = "tenant-theme";

// Writes the tenant palette into a `:root { … }` rule in an injected <style>
// rather than inline styles on <html>. This is load-bearing for dark mode:
// inline styles outrank stylesheet rules, so an inline `--bg` would override
// index.css's `[data-theme="dark"] { --bg: var(--dark-bg) }` remap and pin the
// app to the light palette. A `:root` stylesheet rule is correctly beaten by
// the higher-specificity `[data-theme="dark"]` selector, so the palette swaps.
export function applyCompanyTheme(info: CompanyInfo): void {
  const { colors, typography, rounded, spacing } = info.styleGuide;

  const vars: Record<string, string> = {
    "--bg": colors.bg,
    "--bg-alt": colors.bgAlt,
    "--border": colors.border,
    "--text": colors.text,
    "--muted": colors.muted,
    "--accent": colors.accent,
    "--accent-soft": colors.accentSoft,
    "--accent-secondary": colors.accentSecondary,
    "--accent-tertiary": colors.accentTertiary,
    "--error": colors.error,
    "--dark-bg": colors.darkBg,
    "--dark-bg-alt": colors.darkBgAlt,
    "--dark-border": colors.darkBorder,
    "--dark-text": colors.darkText,
    "--dark-muted": colors.darkMuted,
    "--dark-accent": colors.darkAccent,
    "--dark-accent-soft": colors.darkAccentSoft,
    "--dark-accent-secondary": colors.darkAccentSecondary,
    "--dark-accent-tertiary": colors.darkAccentTertiary,
    "--dark-error": colors.darkError,
    "--font-display": typography.display.fontFamily,
    "--font-weight-display": String(typography.display.fontWeight),
    "--font-heading": typography.heading.fontFamily,
    "--font-weight-heading": String(typography.heading.fontWeight),
    "--font-body": typography.body.fontFamily,
    "--font-weight-body": String(typography.body.fontWeight),
    "--rounded-sm": rounded.sm,
    "--rounded-md": rounded.md,
    "--rounded-lg": rounded.lg,
    "--spacing-xs": spacing.xs,
    "--spacing-sm": spacing.sm,
    "--spacing-md": spacing.md,
    "--spacing-lg": spacing.lg,
    "--spacing-xl": spacing.xl,
  };

  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");

  let el = document.getElementById(TENANT_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = TENANT_THEME_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `:root {\n${body}\n}`;
}
