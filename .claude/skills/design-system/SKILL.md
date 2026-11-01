---
name: design-system
description: The project's tokens, components and visual rules. Use it for every interface spec or page.
---

# Project design system

Orders is a calm, dense, work-focused back office: neutral greys, one blue
accent, system fonts. Keep it short: designer and frontend preload it.

## Where the tokens live

`apps/web/src/styles/tokens.css` (CSS custom properties). Never hand-written
color, spacing or typography values. A missing value is proposed as a new token
in the spec.

## Main tokens

| Token | Use |
|---|---|
| `--color-bg`, `--color-surface`, `--color-border` | page, cards and tables, dividers (neutral greys) |
| `--color-fg`, `--color-fg-muted` | body text, secondary text |
| `--color-accent`, `--color-accent-fg` | primary actions, links, focus ring (blue) |
| `--color-danger` | destructive actions, errors |
| `--status-new`, `--status-paid`, `--status-shipped`, `--status-cancelled` | badge colors: blue, green, grey, red |
| `--space-1` ... `--space-8` | spacing, 4 px base: 4/8/12/16/24/32/48/64 |
| `--font-body` | system font stack; `--font-mono` for order numbers and SKUs |
| `--text-sm`, `--text-md`, `--text-lg`, `--text-xl` | type scale |
| `--radius-sm`, `--radius-md` | corners |
| `--bp-md` (768 px) | below it the orders table becomes cards |

## Base components

In-house, no UI library: Button (primary, secondary, danger), TextField,
Select, Table, Badge (status), Dialog (native `<dialog>`), Toast, Spinner,
Pagination. Each has the states default, hover, visible focus, disabled,
error where it applies.

## Rules

- Contrast at least 4.5:1 for text, 3:1 for badges and focus rings.
- Status is never shown by color alone: the badge always has its text.
- Touch targets of at least 44 px.
- Every page has empty, loading (spinner, `aria-busy`), error (with Retry) and
  success states; toasts are announced with `aria-live`.
- Amounts always show their currency, formatted with `money`; dates with `Intl`
  in the browser's locale.
- Viewports to check: 320, 768, 1280.
