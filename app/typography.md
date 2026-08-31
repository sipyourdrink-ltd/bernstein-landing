# Typography - cheat-sheet

One-page brief on the type system. Read before touching any component.

## Three typefaces, three jobs

- **Instrument Serif** (`font-display`) - editorial voice. Hero title, section titles, card titles. Carries mood; runs large; expects tight tracking and near-1 line-height.
- **Inter / Geist** (`font-sans`) - default body + UI. Neutral, legible from 13-17 px. All prose, buttons, nav, captions.
- **JetBrains Mono** (`font-mono`) - numbers, eyebrows, tags, kbd chips. Tabular-nums when columns align.

## Semantic ramp

Use the named token - never `text-3xl`, `text-base`, etc. - so the paired line-height, letter-spacing, and weight come for free.

| Token | Typeface | Size | Role |
|---|---|---|---|
| `display-1` | display | clamp 3rem → 5rem | Hero headline |
| `display-2` | display | clamp 2rem → 3.25rem | Section title |
| `display-3` | display | clamp 1.5rem → 2.25rem | Sub-section |
| `title-1` | display | 1.375rem | Card title |
| `title-2` | display | 1.125rem | Tight card title |
| `body-lg` | sans | 1.0625rem | Hero sub-head, lead paragraphs |
| `body` | sans | 0.9375rem | Default body copy |
| `body-sm` | sans | 0.8125rem | Caption, footer body |
| `ui-lg` | sans | 0.9375rem | Primary button label |
| `ui` | sans | 0.8125rem | Nav link, chip, badge |
| `mono-eyebrow` | mono | 0.6875rem | UPPERCASE rail above section head |
| `mono-stat` | mono | 0.8125rem | Score / KPI digits |
| `mono-tag` | mono | 0.6875rem | Tag pill |
| `mono-kbd` | mono | 0.75rem | Keyboard chip (⌘K) |

## Preset classes - prefer these over ad-hoc combos

Each `.type-*` class bundles size + family + `font-feature-settings` + `text-wrap`:

- Hero headline → `type-display-1`
- Section title → `type-display-2`
- Sub-section → `type-display-3`
- Card title → `type-title-1`
- Body prose → `type-body`
- Lead paragraph → `type-body-lg`
- Button label → `type-ui` (or `type-ui-lg` for primary CTAs)
- Eyebrow rail → `type-mono-eyebrow`
- Score digit → `type-mono-stat`
- Keyboard chip → `type-mono-kbd`
- Tag pill → `type-mono-tag`

Foundation's older `display-*` / `mono-*` / `prose-body` utilities keep working; `type-*` is an additive semantic alias.

## Rules

1. **Typographic punctuation always.** Curly quotes (" " ' '), em-dashes (-), ellipses (…), non-breaking spaces between numbers + units (9,000&nbsp;downloads) and in proper nouns (Claude&nbsp;Code). Never straight quotes in copy.
2. **Tabular numerals in tables and aligned stats.** The `.type-mono-stat` / `.type-mono-eyebrow` classes already opt into `tabular-nums`. Any `<td>` with digits should use `font-mono` + `font-variant-numeric: tabular-nums`.
3. **`text-wrap: balance` on every heading.** Already baked into `.type-display-*` and `.type-title-*`. Don't fight it.
4. **`text-wrap: pretty` on body prose.** Baked into `.type-body-*`. Prevents orphans on the last line.
5. **One serif headline per viewport chunk.** Two display-1s stacked look like a mistake.
6. **Never mix `leading-tight` / `tracking-tight` with `type-*`.** The tokens already include tuned values; piling more on fights them.

## Letter-spacing scales with size

Rule of thumb: **bigger font → tighter tracking; smaller font → looser or neutral**. At display-1 we're at −0.035em; at body we're at −0.002em; at `mono-eyebrow` we're at +0.14em (because uppercase monospace needs air to breathe). The tokens (`tighter-1` → `tighter-4`, `tight-ui`, `eyebrow`, `tag`) are named so you can reach for the right notch if you must hand-tune.

## Don't

- Don't use raw `text-xl`, `text-2xl`, `text-3xl`, etc. - they carry no leading/tracking defaults.
- Don't set `font-feature-settings` inline unless you're genuinely tuning a one-off.
- Don't scale display type with `text-[2.7rem]` arbitrary values - reach for the ramp.
- Don't `uppercase` anything that isn't mono. Serif all-caps looks shouty; sans all-caps loses its kerning.
