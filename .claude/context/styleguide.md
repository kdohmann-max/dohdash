# DohDash — Design System & Style Guide

> **Mandate: all DohDash apps follow this guide.** No hardcoded colors, no ad-hoc icon SVGs, no magic pixel values.

Construction-inspired precision modern: geometric IBM Plex Sans display paired with warm Comfortaa body. Grid-based layouts with measured accents in construction brass/rust. Professional, distinctive, built-for-builders.

## Colors

CSS custom properties written at runtime by `applyCompanyTheme()`. **Never hardcode hex in CSS or TSX.** `--dark-*` equivalents swap in when `[data-theme="dark"]` is set on `<html>`.

| Token | Light default | Purpose |
|-------|---------------|---------|
| `--bg` | #ffffff | Page/surface backgrounds |
| `--bg-alt` | #f9f8f6 | Sidebar, panel, card backgrounds (warm cream) |
| `--border` | #e8e4df | Dividers, input borders, card outlines |
| `--text` | #1f2328 | Primary text |
| `--muted` | #6b6b6b | Secondary labels, descriptions, placeholders |
| `--accent` | #c86c2e | Primary interactive (construction brass/rust) |
| `--accent-soft` | #fef3ee | Hover backgrounds, focus rings, highlight fills |
| `--accent-secondary` | #1e40af | Secondary actions, important controls (deep blue) |
| `--accent-tertiary` | #fbbf24 | Highlights, "construction gold" accents |
| `--error` | #dc2626 | Destructive actions, error states |

- `--bg` not `#fff`; `--text` not `#000`; `--error` not any hardcoded red.
- Buttons with white text → `color: var(--bg)` (so dark mode inverts).
- `--muted` for secondary/helper text, `--text` for primary.
- `--accent-soft` for hover backgrounds on interactive items; `--accent` for primary focus/active states.
- `--accent-secondary` (deep blue) for secondary/important controls; `--accent-tertiary` (gold) for highlights and accents.

## Typography

Fonts come from `public/CompanyInfo.md` as CSS vars — **never set `font-family` directly**. Geometric IBM Plex Sans for impact, warm Comfortaa for readability.

- `--font-display` / `--font-weight-display` — hero h1, dashboard title (IBM Plex Sans 700)
- `--font-heading` / `--font-weight-heading` — section h2–h4, app names (IBM Plex Sans 600)
- `--font-body` / `--font-weight-body` — body text, content (Comfortaa 400)
- `--font-mono` / `--font-weight-mono` — measurements, technical display, code (IBM Plex Mono 500)

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

## Animations

Three reusable keyframes for entrance/transitions. Use `animation-delay` for staggered reveals (0ms, 100ms, 200ms).

- `fadeIn` — opacity 0→1, 250ms default
- `slideUp` — translateY(12px) → 0, 250ms default
- `slideInLeft` — translateX(-12px) → 0, 250ms default

Apply sparingly; one well-orchestrated entrance (staggered) outweighs scattered micro-interactions.

## Component patterns

**Card / tile with accent bar:**
```css
border-left: 3px solid var(--accent-secondary);
background: var(--bg); border: 1px solid var(--border);
border-radius: var(--rounded-md); padding: var(--spacing-lg);
transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
/* hover: */ border-color: var(--accent); background: var(--accent-soft);
box-shadow: 0 2px 8px rgba(0,0,0,0.08);
```

**Primary button (accent):**
```css
background: var(--accent); color: var(--bg);
border: none; border-radius: var(--rounded-md);
padding: var(--spacing-sm) var(--spacing-lg);
font-weight: var(--font-weight-heading);
transition: opacity 0.15s, box-shadow 0.15s;
/* hover: */ opacity: 0.9; box-shadow: 0 4px 12px rgba(200,108,46,0.2);
```

**Secondary button (blue accent):**
```css
background: transparent; color: var(--accent-secondary); border: 1.5px solid var(--accent-secondary);
border-radius: var(--rounded-md); padding: var(--spacing-sm) var(--spacing-lg);
/* hover: */ background: rgba(30, 64, 175, 0.08);
```

**Destructive (delete/remove only):**
```css
color: var(--error); transition: all 0.15s;
/* hover: */ background: var(--error); color: var(--bg);
```

## Per-component CSS

Each `.tsx` owns a co-located `.css`. Scope all selectors under a unique wrapper class (e.g. `.tasks-app`) to avoid leakage. Inherit shell tokens — don't redefine them.
