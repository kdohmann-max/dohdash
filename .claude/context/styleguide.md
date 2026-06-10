# DohDash — Design System & Style Guide

> **Mandate: All DohDash apps must follow this guide.** No hardcoded colors, no ad-hoc icon SVGs, no magic pixel values.

## Philosophy

Clean, minimal, professional — with a friendly, rounded feel from the Comfortaa typeface. Avoid decorative flourishes, drop shadows, or gradients. Let whitespace and consistent tokens do the work.

## Color System

All colors are CSS custom properties written at runtime by `applyCompanyTheme()`. **Never hardcode hex values in CSS or TSX.**

| Token | Light default | Purpose |
|-------|---------------|---------|
| `--bg` | #ffffff | Page and surface backgrounds |
| `--bg-alt` | #f7f8fa | Sidebar, panel, card backgrounds |
| `--border` | #e2e4e8 | Dividers, input borders, card outlines |
| `--text` | #1f2328 | Primary readable text |
| `--muted` | #5f6368 | Secondary labels, descriptions, placeholders |
| `--accent` | #00bd65 | Interactive elements, links, active states |
| `--accent-soft` | #e8f0fe | Hover backgrounds, focus rings, highlight fills |
| `--error` | #dc2626 | Destructive actions, delete buttons, error states |

Dark equivalents (`--dark-*`) are swapped in automatically when `[data-theme="dark"]` is set on `<html>`.

### Rules

- Use `--bg` not `#fff`. Use `--text` not `#000`. Use `--error` not any hardcoded red.
- Buttons with `color: #fff` → use `color: var(--bg)` so dark mode inverts correctly.
- Use `--muted` for secondary/helper text; `--text` for primary content.
- Use `--accent-soft` for hover backgrounds on interactive items; `--accent` for the active/focus border or icon color.

## Typography

All fonts come from `public/CompanyInfo.md` and are applied as CSS vars:

- `--font-display` / `--font-weight-display` — hero headings, dashboard title
- `--font-heading` / `--font-weight-heading` — section headers, app names (bold)
- `--font-body` / `--font-weight-body` — all body text (regular weight)

Default: Comfortaa for all three. **Never set `font-family` directly — always use the var.**

## Spacing

Five-step scale — use these vars only, no magic pixel numbers:

| Token | Value |
|-------|-------|
| `--spacing-xs` | 4px |
| `--spacing-sm` | 8px |
| `--spacing-md` | 12px |
| `--spacing-lg` | 16px |
| `--spacing-xl` | 32px |

Standard pattern: card padding = `--spacing-lg`; item gap = `--spacing-sm` or `--spacing-md`; section separation = `--spacing-xl`.

## Border Radius

| Token | Value | Use |
|-------|-------|-----|
| `--rounded-sm` | 4px | Badges, tags, small chips |
| `--rounded-md` | 6px | Cards, app tiles, input fields, buttons |
| `--rounded-lg` | 8px | Modals, panels, larger containers |

Default for most interactive elements: `--rounded-md`.

## Icons

**Icon library: `src/icons/index.tsx`** — the only place to define or import app icons.

### Rules

- **Never inline ad-hoc SVGs in component files.** Add them to `src/icons/index.tsx` and import.
- All icons use the shared `svgProps(size)` helper defined in that file.
- Default rendered size: 28px (configurable via `size` prop).
- ViewBox: `0 0 24 24`
- Stroke: `currentColor`, width `1.5`, `strokeLinecap: "round"`, `strokeLinejoin: "round"`
- Fill: `none` (stroke-only, no fills)
- Color: always inherits via `currentColor` — the parent sets color, not the icon

### Adding a new icon

```tsx
export function MyAppIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="..." />
    </svg>
  );
}
```

## Light / Dark Theme

The `data-theme` attribute on `<html>` (managed by `src/theme.ts`) swaps in dark palette values.

- Every color reference in CSS **must** work in both modes.
- Test by toggling the theme button in the shell header.
- The `--dark-*` vars are set by `applyCompanyTheme()`; the `[data-theme="dark"]` rule in `index.css` remaps the un-prefixed vars to them.

## Component Patterns

### Cards / Tiles

```css
background: var(--bg);
border: 1px solid var(--border);
border-radius: var(--rounded-md);
padding: var(--spacing-lg);
```

Hover:
```css
border-color: var(--accent);
background: var(--accent-soft);
```

### Primary Buttons

```css
background: var(--accent);
color: var(--bg);          /* NOT #fff */
border: none;
border-radius: var(--rounded-md);
padding: var(--spacing-sm) var(--spacing-lg);
```

### Destructive / Delete

```css
color: var(--error);
```

Use `--accent` for primary actions; `--error` for destructive (delete, remove, reset) actions only.

## Per-Component CSS

Each `.tsx` component owns a co-located `.css` file. Scope all selectors under a unique wrapper class (e.g., `.tasks-app`) to avoid style leakage between apps. Inherit shell tokens — don't redefine them inside the app.
