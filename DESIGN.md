# ChurchSeeker design and implementation plan (single source of truth)

Goal: a Renaissance, Gothic and sigil look that is also modern and material, monochrome everywhere except the map, with Asciify characters as the living material and SVG ornaments drawn in code that pair with them. Symbols stay open to interpretation so any religion can recognise itself in them. This document replaces the earlier `DESIGN.md` and `OVERHAUL.md`; the work is organised in phases, each one PR.

## 1. Where we are
Done and merged: the stone-and-ink design system (phase A), the login tree of life (B), sigils, decoded names and the first map styling (C), Asciify in the admin (D), and the Asciify component batch (toasts, pills, skeleton, slide-to-confirm with disintegrate, dropzone, Ctrl+K palette, cursor trail, beam, button loading). What follows supersedes the colours chosen in phase A: the project goes fully monochrome.

## 2. Principles
1. **Monochrome.** Neutral greys, bone-white accent, no hue anywhere except the map. No yellow, no gold.
2. **Characters have a job.** Asciify is used where it answers the interface (loading, confirming, moving), never behind body text, forms or tables. A *surface* is a full field that fills an area (`artPanel`, `morphField`, `fieldBackground`, `globe`): one per page. Small components (`cursorTrail`, `beam`, `buttonLoading`, `statusOrb`, `odometer`, `decode`, `toastStack`, `pill`, `skeleton`, `blockChart`) are not surfaces and may sit beside one, within the kit's shared context budget.
3. **Universal symbols only.** Tree of life, rosette, flame or lamp, dawn light, arch or doorway, ring, water, mountain, open hands. No cross, crescent, om, or the emblem of any one tradition; no figures.
   - Stars have 7 points only (a 12-point star has 4-fold and 6-fold symmetry, so it can form a cross or a hexagram).
   - The tree is organic (uneven branches), never a 10-node diagram.
   - Arches stay simple and are not paired with a rosette on the same screen.
   - Ornaments and sigils use odd folds only (7 by default). A pattern repeated 7 times cannot have 4-fold or 6-fold symmetry, so it cannot form a cross or a hexagram. Tests check the fold count.
4. **Gothic structure, modern surface.** Pointed-arch frames, tracery, corner marks and hairline rules on flat, quiet panels.
5. **Quiet motion.** Slow, eased, reduced-motion safe. Motion confirms something happened.
6. **Meaning never rides on colour alone.**

## 3. Tokens (monochrome)
| Token | Value | Use |
|---|---|---|
| `--ground` | #080808 | page |
| `--stone` | #111111 | panels |
| `--stone-high` | #181818 | raised panels, inputs |
| `--rule` | rgba(255,255,255,.14) | decorative hairlines only (about 1.5:1) |
| `--edge` | rgba(255,255,255,.45) | borders of controls (about 4.5:1) |
| `--rule-strong` | rgba(255,255,255,.55) | focus, active |
| `--ink` | #ececec | text |
| `--ink-dim` | #9a9a9a | secondary text (about 6.6:1 on stone) |
| `--accent` | #f5f5f5 | accent, primary button fill |
| `--ok` / `--warn` / `--bad` | #dcdcdc / #b5b5b5 / #ffffff | outcomes, always with a word and a shape (the greys are close on purpose: the word and the shape carry the meaning) |
| `--radius` | 6px | controls |
| `--ease` / `--dur` | cubic-bezier(.2,.7,.2,1) / 220ms | motion |

- **Outcomes by words and shape.** Every outcome starts with a word ("Listo:", "Aviso:", "Error:") and has its own icon and border (solid with a check, dashed with "!", double with a cross). Field errors get the icon and an underline. Charts use direct labels and a pattern per series.
- **Everything that draws** follows: Asciify inks (`--ascii-ink` = `--ink-dim`, `--ascii-ink-strong` = `--ink`, outcomes = the three greys), 3D materials, procedural textures, the PDF reader, the tree of life and every colour literal in code move to greys or tokens.
- **Test:** a unit test parses `index.css`, composites every alpha token over its background, and fails if a text pairing is under 4.5:1, a control border under 3:1, or a token has a hue (red, green and blue not equal).

## 4. Type (self-hosted, no CDN; the CSP stays strict)
Cormorant Garamond for titles and church names (weight 500 or more, never below 1.25rem); Cinzel for small-caps labels (never below 0.8rem); Inter (variable) for reading; IBM Plex Mono is installed but not loaded: the Asciify kit draws with its own monospace stack (a font is waited for with `document.fonts.load()` only where text is drawn to a canvas, as for the book spines). Latin subset, woff2, about 250 KB in total, never inlined (the CSP blocks `data:` fonts). No blackletter.

## 5. Ornaments: SVG components that pair with Asciify
A library of SVG parts drawn in code in a Gothic, Renaissance and sigil spirit, in the system's inks. Nothing external, so no licences.
- **Parts:** pointed-arch frames, trefoil and seven-fold tracery, a rosette, corner marks, dividers, cartouches and plaques, drop capitals in Cinzel, a guilloche border, a ring, a lamp, a tree, a doorway, a path.
- **Where:** empty states, the loading screen, the empty states, section headers, the dashboard strip, the church-viewer frame, the book shelf.
- **Pairing with Asciify:**
  1. *Frames hold fields.* The login art panel and any other full-field surface are clipped to a pointed-arch or rosette shape from the library. Small components are not clipped.
  2. *Ornament as source.* An SVG ornament is rasterised once and fed to a glyph field (`morphField`) so a sigil can condense out of characters into lines and back.
  3. *Shared ink and grid.* Ornament strokes use the same ink tokens and the same line weight as the field's cell size.
  4. *Text pairs.* `decode` runs on the caption of an ornament; the real text stays in the DOM.
  5. One surface per page (`morphField` counts as that surface), and every ornament works without WebGL as plain SVG.
- **Interaction:** strokes draw themselves in, rays turn slowly, tracery brightens on hover and focus; all of it stops under reduced motion.
- **Decorative by default:** `aria-hidden`, never behind text, no pointer capture. Tests check the fold count of every ornament, that none is behind text, and the SVG weight: at most 6 KB per ornament and 40 KB of SVG source for the whole library (measured as raw text, not gzipped).
- A seed gives each church and each book its own variation.

## 6. Asciify components: status
| Component | State |
|---|---|
| `artPanel`, `decode`, `statusOrb`, `odometer`, `blockChart` | done |
| `cursorTrail`, `beam`, `buttonLoading` | done (sign-in) |
| `toastStack`, `pill`, `skeleton` | done (users, members) |
| `slideToConfirm` + `disintegrate`, `dropzone`, `commandPalette` | done (codex removal, logo, Ctrl+K) |
| `morphField` | phase F (sigil morph) |
| `scramble` on menu links, `pageDissolve` between modules | done: `scramble` plays on pointer hover over the admin menu links (real text stays, no replay on keyboard focus); `pageDissolve` carries one admin module out and the next in from the clicked link (plain swap without GL, with reduced motion or if the kit fails) |
| `globe` | only if the map intro is approved (assumed no) |
| `wordmark`, `tabs` | not used: `wordmark` draws large letters only; the admin menu is made of links the e2e specs rely on |
| `fieldBackground` 404 | done: the 404 draws the numerals in characters that scatter under the pointer and break apart and re-form when "Volver al mapa" is pressed; the message and the button are HTML (the screen shown when the church list cannot load uses the same field with its status, 503 for no answer, and a Reintentar button that breaks the numerals apart while it tries again) |

## 7. Churches as line engravings
The churches were first built as 3D models (a facade kit, authored models, typologies, scans, a fixed close-up view). They never looked right next to the books, so they were replaced by **engravings**: each church is a front elevation drawn in lines with parallel hatching, in the ink of the interface, the way a Renaissance plate would show it. The 3D model code, the model upload rules and the Draco decoders were removed; the book shelf is the only 3D left.
- **Plates.** Three drawn by hand for the pilot churches from their real arrangement (cathedral: two towers, crossing dome, two-order facade; Jesús: slender towers, dome on a drum, seven-spoke window; Santa Lucía: a bell gable over an arcade) and four typologies (nave, rotunda, portico, courtyard) for every other church, varied by the church's id (towers, dome, number of columns). Anything not verified is an interpretation, as before.
- **Made of:** `engraving/draft.ts` (lines, solids that hide what is behind them, three densities of hatching made with SVG patterns, so a plate weighs a few KB), `plates.ts`, `choose.ts` (which plate for which id) and `markup.ts` (the SVG as text, used by the page and by the map markers). No cross, crescent or figure; anything that repeats around a point repeats seven times.
- **Where:** the church's page shows the engraving on a sheet with a caption, drawing itself in (lines first, then the hatching; still under reduced motion); on the map every church has a marker with its engraving on a small plate from zoom 15.5, its sigil badge, and its name from zoom 15.
- **Why it works:** pure SVG, the same on every device, no WebGL, no downloads, no models to optimise or upload, and it is legible at any size.
- **Optional later:** a photo uploaded by each church, shown in greys with a grain and an arch frame, next to the engraving.

## 8. Books
Greyscale only (the admin's chosen colour stays stored and is shown by its luminance), about 40% thinner, slightly varied heights. Details: spine bands, a stamped sigil seeded from the title, a tooled border, the title in Cinzel and a small lozenge ornament at the tail of the spine, drawn to canvas textures from the ornament library. A pointed-arch frame for the shelf; books lean and lift on hover. The PDF reader goes monochrome, with a guilloche band under its toolbar instead of the shelf's arch (an arch would cut the toolbar corners).

## 9. The map: satellite view, with colour
- Satellite is the default: Esri World Imagery (no key; `arcgisonline.com` is already allowed by the CSP) with a labels layer on top (places and roads) so names stay readable, and a toggle to the street map. Full colour, no muting: the map is the one place with colour.
- Zoom limits follow the imagery's real resolution in Mérida; attribution stays.
- A monochrome atlas frame (hairline rules, corner marks from the ornament library), a north arrow with one tick (no cross-shaped compass rose), controls restyled to the system.
- Markers: HTML markers over the map, one per church: a sigil badge with its name in Cinzel from zoom 15 and, from zoom 15.5, the church's engraving on a small dark plate standing above it (section 7). The mouse can hover and click a marker (it selects the church); the church list stays the way in for the keyboard and screen readers, so markers are `aria-hidden`.
- Selection, flight and arrival keep their logic and their e2e specs; tests keep tile requests stubbed so they never depend on the live server.

## 10. Phases (one PR each; advisor review before each merge)
Done: A system, B login, C public view, D admin Asciify, the Asciify batch. The books phase is named L so it does not clash with the finished B.
| Phase | Content | Checks |
|---|---|---|
| E. Monochrome | section 3: tokens, outcomes by words and shape, greys everywhere, ink mapping | contrast test with alpha compositing, full e2e |
| M. Satellite map | section 9 without the markers: imagery, labels, toggle, atlas frame, restyled controls | phase4 e2e with stubbed tiles, screenshots |
| F. Ornaments and Asciify pairing | section 5: SVG parts, arch-clipped fields, sigil morph, illustrations, 404, empty states, plus `scramble` and `pageDissolve` (done in the admin area) | fold, aria-hidden and size tests, screenshots |
| R1. Facade kit and the cathedral | the kit, the cathedral model, two detail levels, seed coordinates fixed (replaced by the engravings) | geometry bounds and triangle budget tests |
| R2. Jesús, Santa Lucía and the viewer | the other two models and the fixed low front view (replaced by the engravings) | e2e, screenshots |
| L. Books | section 8 (done: greys, slimmer, sigil stamps, arch frame) | bookshelf tests, screenshots |
| S. Scans and typologies | tier 1 rules and guide, tier 3 typologies (replaced by the engravings; the model upload rules left the viewer) | upload tests, budget tests |
| H. Map markers | sigil badges and names (done) | phase4 e2e |
| G. Engravings | the 3D churches replaced by line engravings: plates, page, map markers, 3D code removed (done) | plate bounds, weight and determinism tests, e2e |

## 11. Constraints (apply to every phase)
- Accessible names, roles and Spanish labels stay the same, so the Playwright specs keep working (they match on text and roles).
- Animated text (`decode`, `scramble`, `odometer`) is a visual layer: the final text is always in the DOM. A page transition never leaves two pages mounted.
- Inputs and buttons keep a 3:1 boundary.
- The production build is tested too, since the CSP applies only there.
- One Asciify surface (a full field) at a time, small components aside, paused off-screen, frame rate capped; Asciify code loads lazily; without WebGL or with reduced motion a still or plain markup shows and everything works.
- **WebGL context budget** (the leak test caps canvases at 4): public map 1 (markers inside it). Opening a church unmounts the map, as the app does today, so the church view is the engraving (SVG, no context), plus 1 for the book shelf, plus 1 only while an Asciify surface is on: 2 at most. Login 1 (the art panel; the small components share the kit's budget); admin 0 to 2.
- **No text over images.** Text never sits over an image, an ornament or an Asciify field. Church names over the satellite imagery sit on their own plate (section 9).
- Plate bounds, as tested: every plate stays on its 240 by 180 sheet, rests on the ground line, has no NaN and weighs under 14 KB of path data.
- Hatching, outlines and any engraving are done in the material (`onBeforeCompile`, `EdgesGeometry`), not with a post-process composer. The e2e checks that shaders compile and log no GL error; it never compares pixels.

## 12. Risks
- Fidelity depends on references: without photos the plates of the pilot churches are interpretations of their real arrangement.
- Imagery tiles are external: stubbed in tests, attribution kept, the street map is the fallback if imagery fails.
- Bundle: lazy chunks per feature, budgets checked per PR.
- Low-vision users: meaning never depends on colour alone.

## 13. Open choices
1. Photos or plans of the three churches, even phone photos: they make the plates more faithful (and can be shown beside them).
2. Globe intro before the map: assumed no.
3. Per-church sigil: generated from the name (assumed) or designed by each church later.

## 14. Gaps closed and gaps left
An audit of this document against the code found gaps; they were closed in the same round except those listed below. The 3D churches were later replaced by engravings (section 7), which also retired the viewer plaque, the weak-device detail level and the kit size budget.
- **Closed:** ornaments in admin module titles and the PDF reader, the "never behind text" placement test, toasts with a check and "Listo:", a solid underline on invalid fields, the paper texture in grey.
- **By design, not gaps:** the bar chart has one hatch pattern because it has one series; the Events and Reports pages have no empty lists to illustrate; the PDF reader uses a guilloche band, not an arch.
- **Left open:** the Esri World Imagery licence without a key needs a check before production. The backend still accepts a .glb upload for a church (`/api/church/model`) although no page shows it any more; it can be removed with its tests.
