// Loads public/CompanyInfo.md at runtime (not bundled) and applies its style
// guide as CSS custom properties. Swapping that one file re-brands the app —
// no rebuild, no source edits.

import matter from "gray-matter";
import type { CompanyInfo } from "./types";

export async function loadCompanyInfo(): Promise<CompanyInfo> {
  const res = await fetch("/CompanyInfo.md");
  if (!res.ok) throw new Error(`Failed to load CompanyInfo.md (${res.status})`);
  const raw = await res.text();
  const { data, content } = matter(raw);
  return { ...(data as Omit<CompanyInfo, "about">), about: content.trim() };
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
  root.setProperty("--dark-bg", colors.darkBg);
  root.setProperty("--dark-bg-alt", colors.darkBgAlt);
  root.setProperty("--dark-border", colors.darkBorder);
  root.setProperty("--dark-text", colors.darkText);
  root.setProperty("--dark-muted", colors.darkMuted);
  root.setProperty("--dark-accent", colors.darkAccent);
  root.setProperty("--dark-accent-soft", colors.darkAccentSoft);

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
