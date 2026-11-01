---
name: design-system
description: The project's tokens, components and visual rules. Use it for every interface spec or page.
---

# Project design system

<!-- CUSTOMIZE: this whole file. Keep it short: designer and frontend preload it on every start. -->

## Where the tokens live

`src/styles/tokens.css`. Never hand-written color, spacing or typography values.

## Main tokens

| Token | Use |
|---|---|
| `--color-bg` | page background |
| `--color-fg` | body text |
| `--color-accent` | primary actions, links |
| `--space-1` ... `--space-6` | spacing, scale 4/8/12/16/24/32 px |
| `--font-body`, `--font-display` | font families |

## Base components

Button, text field, select, card, modal, toast. Each has the states default,
hover, visible focus, disabled, error.

## Rules

- Minimum contrast 4.5:1 for body text.
- Touch targets of at least 44 px.
- Every page has empty, loading and error states.
