# Mugah cross-promo chip in PDF Proofread header

**Date:** 2026-04-30
**Status:** approved

## Goal

Add a small inline advertisement in the `<header>` of the PDF Proofread app that
promotes mugah.co (the paid Word add-in). The open-source PDF Proofread tool is
the funnel; the chip is the cross-sell.

## Visual

- Inline pill in the existing `<header>` (`src/App.tsx:176`), placed after the
  title `<h1>`. The title gets `me-auto` so the chip lands on the far end (left
  edge in RTL).
- Rounded-full pill, ~32–36px tall, single line, never wraps.
- Palette and typography from `~/Mugah/client/public/index.html` so it reads as
  the actual Mugah brand, not a re-skin:
  - Background: `#09090b` (Mugah `--bg`)
  - Border: `1px solid rgba(59,130,246,0.4)` (Mugah `--accent-strong`)
  - Text: `#fafafa` (Mugah `--text`)
  - Hover: blue glow `0 0 12px rgba(59,130,246,0.15)` + border brightens to
    `#3b82f6` (Mugah `--accent`)
  - Hebrew text in `'Noto Serif Hebrew', serif` (matches Mugah's hebrew font)
- The dark chip sits on the white pdf_proofread page deliberately — a stamped
  brand mark, not blended in.

## Copy

`נסו את מוגה לוורד ←`

(RTL — arrow rendered as `←` will visually point toward the link. Use a real
character, not an icon import, to keep the component dependency-free.)

On screens narrower than ~480px the chip stays exactly the same — the copy is
already short enough to fit.

## Behavior

- `<a>` element, `href="https://mugah.co/?utm_source=pdf_proofread&utm_medium=header_ad&utm_campaign=cross_promo"`
- `target="_blank"`, `rel="noopener noreferrer"`
- `aria-label="נסו את מוגה — תוסף הגהה תורנית ל-Word"`
- No JS state, no analytics beyond UTM params.

## Implementation

- New file `src/components/MugahPromo.tsx`, ~30 lines, default export.
- Use Tailwind arbitrary-value classes for the Mugah-specific colors so the
  component stays self-contained without theme changes:
  `bg-[#09090b]`, `border border-[rgba(59,130,246,0.4)]`,
  `text-[#fafafa]`, `hover:border-[#3b82f6]`,
  `hover:shadow-[0_0_12px_rgba(59,130,246,0.25)]`,
  plus standard `rounded-full`, `inline-flex`, `items-center`, `gap-2`,
  `px-3`, `py-1.5`, `text-sm`, `transition-all`, `duration-300`.
- Noto Serif Hebrew font: load once via a `<link>` element injected into
  `<head>` from the component on mount (idempotent — check for existing
  `link[data-mugah-promo-font]` before inserting). Avoid editing the global
  `index.html` so the chip stays self-contained. Apply the font with an
  inline `style={{ fontFamily: "'Noto Serif Hebrew', serif" }}` on the chip.
- Import `MugahPromo` in `App.tsx`. Add `me-auto` to the existing `<h1>`
  so the chip lands on the opposite end of the header in RTL.

## Out of scope

- Tracking beyond UTM params (no pixels, no event hooks).
- A/B copy testing.
- Showing/hiding the chip based on locale, time, or feature flags.
- Any change to mugah.co itself.

## Acceptance

- Chip appears in the header on every page load.
- Click opens mugah.co in a new tab with the UTM params attached.
- Chip looks visually distinct (Mugah-branded), not like a default shadcn
  button.
- No layout shift, no horizontal scroll, no console warnings.
- `npm run typecheck` and `npm run lint` clean.
