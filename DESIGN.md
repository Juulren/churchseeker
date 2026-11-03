# ChurchSeeker design direction (phases A to D done; see the status table)

Goal: a Renaissance, sigil and Gothic look that is also modern and material, with Asciify characters as the living material. Symbols stay open to interpretation so any religion can recognise itself in them.

## Principles
1. **Stone and ink.** Dark blue-black ground, bone-white accent, one muted secondary hue for outcomes. No yellow, no gold.
2. **Characters have a job.** Asciify is used where it answers the interface (loading, confirming, moving, one ground per page), never behind body text, forms or tables.
3. **Universal symbols only.** Tree of life, rosette, flame or lamp, dawn light, arch or doorway, ring, water, mountain, star, open hands. No cross, crescent, om, or any single tradition's emblem. Each church gets a neutral sigil generated from its name.
   - Stars use 7 or 12 points only (6, 8, 9 and an inverted 5 each belong to a tradition).
   - The tree is organic (uneven branches), never a 10-node diagram.
   - Arches stay simple and are not paired with a rosette on the same screen, so it does not read as one cathedral.
   - The sigil is seven-fold symmetric (`sigil.ts`). A pattern repeated 7 times cannot have 4-fold or 6-fold symmetry, so it cannot form a cross or a hexagram; tests check the fold count and the repetition for the seeded church names. There is no per-shape rejection list.
4. **Gothic structure, modern surface.** Pointed-arch frames, tracery lines, corner marks and hairline rules on flat, quiet panels. No skeuomorphic textures on the interface.
5. **Quiet motion.** Slow, eased, reduced-motion safe. Motion confirms something happened.

## Tokens (replace the current :root set)
| Token | Value | Use |
|---|---|---|
| `--ground` | #07090d | page |
| `--stone` | #10141b | panels |
| `--stone-high` | #171c25 | raised panels, inputs |
| `--rule` | rgba(232,228,218,.14) | decorative hairlines only |
| `--edge` | rgba(232,228,218,.45) | borders of inputs and buttons (3:1 or better) |
| `--rule-strong` | rgba(232,228,218,.55) | focus, active |
| `--ink` | #e8e4da | text (bone) |
| `--ink-dim` | #8d94a1 | secondary text |
| `--accent` | #f4f1ea | accent, primary button fill |
| `--ok` | #7fa392 | success (verdigris) |
| `--warn` | #b08d6e | warning (burnt umber) |
| `--bad` | #d9858a | error text and marks (soft ruby, 4.5:1 or better on stone) |
| `--radius` | 6px | all controls (crisper than today's 14px) |
| `--ease` / `--dur` | cubic-bezier(.2,.7,.2,1) / 220ms | motion |

Asciify inks map to these: `--ascii-ink` = `--ink-dim`, `--ascii-ink-strong` = `--ink`, `--ascii-success|warning|error` = `--ok|--warn|--bad`.

## Type (self-hosted, no CDN; the CSP stays strict)
- Display: Cormorant Garamond (Renaissance serif), titles and church names; weight 500 or more, never below 1.25rem.
- Small caps labels: Cinzel, tracked, never below 0.8rem.
- Body: Inter (variable file).
- Characters: IBM Plex Mono, loaded only with the lazy Asciify chunk; wait for `document.fonts.load()` before drawing to canvas.
- Budget: Latin and Latin-ext subsets only, woff2, about 250 KB in total. Fonts are never inlined (`assetsInlineLimit` excludes them) because the CSP blocks `data:` fonts.
- No blackletter: it reads as German and Christian and carries extremist associations.

## Asciify components
| Surface | Component |
|---|---|
| Login art | a growing tree of life as characters (`asciiVideo` fed by a procedural tree, or `morphField`), slow breathing; pulses on submit |
| Titles on first view | `decode` / `scramble` for the church name and page title |
| Brand | `wordmark` (assembling on first load) |
| Loading, success, error | `statusOrb`, `buttonLoading`, `toastStack` |
| Dashboard | `blockChart`, `odometer` for the KPIs |
| Admin tabs and badges | `tabs`, `pill` |
| Route changes | `pageDissolve` |
| Public map | one ground only: none behind the map; sigil of each church over its marker |
| 404 | `fieldBackground` notFound |
| Primary buttons and the focused card | `beam` (quiet border light), `cursorTrail` on the login art only |
| Loading states in lists and panels | `skeleton`, `statusOrb` |
| Destructive admin actions (deactivate user, remove book) | `slideToConfirm`, `disintegrate` on removal |
| File uploads (logo, 3D model, PDF) | `dropzone` |
| Admin quick navigation | `commandPalette` (Ctrl+K) |
| Public landing | `globe` of dots with the churches as points, as the quiet ground before a church is chosen |
| Church name / sigil | `wordmark` assembling the name; sigil drawn with `morphField` once on entry |

## Status of the Asciify components
| Component | State |
|---|---|
| `artPanel` (login tree, cursor trail, pulse) | done |
| `decode` (church name, admin module title) | done |
| `statusOrb` (loading) | done |
| `odometer` (dashboard figures) | done |
| `blockChart` (dashboard charts) | done |
| `buttonLoading`, `beam`, `cursorTrail` | not yet |
| `toastStack`, `pill`, `tabs`, `skeleton` | not yet |
| `slideToConfirm`, `disintegrate`, `dropzone` | not yet (the e2e specs click plain buttons) |
| `commandPalette`, `pageDissolve`, `wordmark`, `scramble` | not yet |
| `globe`, `fieldBackground` 404, `morphField` | not yet |

## Phases (one PR each, E2E kept green)
- **A. System.** Tokens (with aliases for the old `--panel` and `--panel-edge` names), fonts, base classes (`rpg-panel`, buttons, inputs, tables, notices), Gothic frame and corner marks, Asciify ink mapping.
- **B. Login and reset.** Same grid, new tree-of-life art, decode headline, button loading, orb states.
- **C. Public map and church view.** Sigil generator, panels, labels, book shelf frame, route dissolve.
- **D. Admin.** Shell, tables, forms, dashboard charts, modals, users screen.

## Constraints
- Accessible names, roles and Spanish labels stay the same, so the Playwright specs keep working (they match on text and roles).
- Animated text (`decode`, `scramble`, `odometer`, `wordmark`) is a visual layer: the final text is always in the DOM, and the animation sits in an `aria-hidden` layer. `pageDissolve` never leaves two pages mounted.
- Inputs and buttons get a 3:1 boundary through `--edge` or a fill difference.
- Production build is tested too, since the CSP applies only there.
- One Asciify surface at a time, paused off-screen, frame rate capped.
- Asciify code loads lazily; WebGL off or reduced motion gives a still and the form still works.
- 17 hard-coded colours in 5 .tsx files move to tokens; the 3D textures in `quality/` and `map3d/` are handled in phase C.

## Open choice for you
Sigil per church: generated from the name (what this plan does), or do you want each church to design its own later?
