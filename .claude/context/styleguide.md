# DohDash — Design System & Style Guide

> **Mandate: all DohDash apps follow this guide.** No hardcoded colors, no ad-hoc icon SVGs, no magic pixel values.

Clean, minimal, professional with a friendly rounded feel (Comfortaa). No decorative flourishes, drop shadows, or gradients.

## Colors

CSS custom properties written at runtime by `applyCompanyTheme()`. **Never hardcode hex in CSS or TSX.** `--dark-*` equivalents swap in when `[data-theme="dark"]` is set on `<html>`.

| Token | Light default | Purpose |
|-------|---------------|---------|
| `--bg` | #ffffff | Page/surface backgrounds |
| `--bg-alt` | #f7f8fa | Sidebar, panel, card backgrounds |
| `--border` | #e2e4e8 | Dividers, input borders, card outlines |
| `--text` | #1f2328 | Primary text |
| `--muted` | #5f6368 | Secondary labels, descriptions, placeholders |
| `--accent` | #00bd65 | Interactive elements, links, active states |
| `--accent-soft` | #e8f0fe | Hover backgrounds, focus rings, highlight fills |
| `--error` | #dc2626 | Destructive actions, error states |

- `--bg` not `#fff`; `--text` not `#000`; `--error` not any hardcoded red.
- Buttons with white text → `color: var(--bg)` (so dark mode inverts).
- `--muted` for secondary/helper text, `--text` for primary.
- `--accent-soft` for hover backgrounds on interactive items; `--accent` for active/focus border or icon color.

## Typography

Fonts come from `public/CompanyInfo.md` as CSS vars — **never set `font-family` directly**. Default: Comfortaa for all three.

- `--font-display` / `--font-weight-display` — hero headings, dashboard title
- `--font-heading` / `--font-weight-heading` — section headers, app names (bold)
- `--font-body` / `--font-weight-body` — body text (regular)

## Spacing

Five-step scale only, no magic numbers. Standard pattern: card padding `--spacing-lg`; item gap `--spacing-sm`/`--spacing-md`; section separation `--spacing-xl`.

| Token | Value |  | Token | Value |
|-------|-------|--|-------|-------|
| `--spacing-xs` | 4px |  | `--spacing-lg` | 16px |
| `--spacing-sm` | 8px |  | `--spacing-xl` | 32px |
| `--spacing-md` | 12px |  | | |

## Border radius

| Token | Value | Use |
|-------|-------|-----|
| `--rounded-sm` | 4px | Badges, tags, chips |
| `--rounded-md` | 6px | Cards, tiles, inputs, buttons (default) |
| `--rounded-lg` | 8px | Modals, panels, larger containers |

## Icons

**`src/icons/index.tsx` is the only place to define/import app icons** — never inline ad-hoc SVGs in components.

- Use the shared `svgProps(size)` helper. Default size 28px (`size` prop).
- ViewBox `0 0 24 24`; stroke `currentColor` width `1.5`, `strokeLinecap`/`strokeLinejoin` `"round"`; fill `none`. Color always inherits via `currentColor` (parent sets it).

```tsx
export function MyAppIcon({ size }: { size?: number } = {}) {
  return <svg {...svgProps(size)}><path d="..." /></svg>;
}
```

## Light / dark theme

`data-theme` on `<html>` (managed by `src/theme.ts`) swaps in the dark palette. Every color reference **must** work in both modes — test with the shell header toggle. `applyCompanyTheme()` sets the `--dark-*` vars; the `[data-theme="dark"]` rule in `index.css` remaps the un-prefixed vars to them.

## Component patterns

```css
/* Card / tile */
background: var(--bg); border: 1px solid var(--border);
border-radius: var(--rounded-md); padding: var(--spacing-lg);
/* hover: */ border-color: var(--accent); background: var(--accent-soft);

/* Primary button */
background: var(--accent); color: var(--bg); /* NOT #fff */
border: none; border-radius: var(--rounded-md);
padding: var(--spacing-sm) var(--spacing-lg);

/* Destructive (delete/remove/reset only) */
color: var(--error);
```

## Per-component CSS

Each `.tsx` owns a co-located `.css`. Scope all selectors under a unique wrapper class (e.g. `.tasks-app`) to avoid leakage. Inherit shell tokens — don't redefine them.
