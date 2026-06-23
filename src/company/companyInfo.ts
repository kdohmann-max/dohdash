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

export function applyCompanyTheme(info: CompanyInfo): void {
  const root = document.documentElement.style;
  const { colors, typography, rounded, spacing } = info.styleGuide;

  root.setProperty("--bg", colors.bg);
  root.setProperty("--bg-alt", colors.bgAlt);
  root.setProperty("--border", colors.border);
  root.setProperty("--text", colors.text);
  root.setProperty("--muted", colors.muted);
  root.setProperty("--accent", colors.accent);
  root.setProperty("--accent-soft", colors.accentSoft);
  root.setProperty("--accent-secondary", colors.accentSecondary);
  root.setProperty("--accent-tertiary", colors.accentTertiary);
  root.setProperty("--error", colors.error);
  root.setProperty("--dark-bg", colors.darkBg);
  root.setProperty("--dark-bg-alt", colors.darkBgAlt);
  root.setProperty("--dark-border", colors.darkBorder);
  root.setProperty("--dark-text", colors.darkText);
  root.setProperty("--dark-muted", colors.darkMuted);
  root.setProperty("--dark-accent", colors.darkAccent);
  root.setProperty("--dark-accent-soft", colors.darkAccentSoft);
  root.setProperty("--dark-accent-secondary", colors.darkAccentSecondary);
  root.setProperty("--dark-accent-tertiary", colors.darkAccentTertiary);
  root.setProperty("--dark-error", colors.darkError);

  root.setProperty("--font-display", typography.display.fontFamily);
  root.setProperty("--font-weight-display", String(typography.display.fontWeight));
  root.setProperty("--font-heading", typography.heading.fontFamily);
  root.setProperty("--font-weight-heading", String(typography.heading.fontWeight));
  root.setProperty("--font-body", typography.body.fontFamily);
  root.setProperty("--font-weight-body", String(typography.body.fontWeight));

  root.setProperty("--rounded-sm", rounded.sm);
  root.setProperty("--rounded-md", rounded.md);
  root.setProperty("--rounded-lg", rounded.lg);

  root.setProperty("--spacing-xs", spacing.xs);
  root.setProperty("--spacing-sm", spacing.sm);
  root.setProperty("--spacing-md", spacing.md);
  root.setProperty("--spacing-lg", spacing.lg);
  root.setProperty("--spacing-xl", spacing.xl);
}
