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
Cormorant Garamond for titles and church names (weight 500 or more, never below 1.25rem); Cinzel for small-caps labels (never below 0.8rem); Inter (variable) for reading; IBM Plex Mono for characters, loaded only with the lazy Asciify chunk (wait for `document.fonts.load()` before drawing to canvas). Latin subset, woff2, about 250 KB in total, never inlined (the CSP blocks `data:` fonts). No blackletter.

## 5. Ornaments: SVG components that pair with Asciify
A library of SVG parts drawn in code in a Gothic, Renaissance and sigil spirit, in the system's inks. Nothing external, so no licences.
- **Parts:** pointed-arch frames, trefoil and seven-fold tracery, a rosette, corner marks, dividers, cartouches and plaques, drop capitals in Cinzel, a guilloche border, a ring, a lamp, a tree, a doorway, a path.
- **Where:** empty states, the loading screen, the 404 (a path to an open doorway), section headers, the dashboard strip, the church-viewer frame, the book shelf.
- **Pairing with Asciify:**
  1. *Frames hold fields.* The login art panel and any other full-field surface are clipped to a pointed-arch or rosette shape from the library. Small components are not clipped.
  2. *Ornament as source.* An SVG ornament is rasterised once and fed to a glyph field (`morphField`) so a sigil can condense out of characters into lines and back.
  3. *Shared ink and grid.* Ornament strokes use the same ink tokens and the same line weight as the field's cell size.
  4. *Text pairs.* `decode` runs on the caption of an ornament; the real text stays in the DOM.
  5. One surface per page (`morphField` counts as that surface), and every ornament works without WebGL as plain SVG.
- **Interaction:** strokes draw themselves in, rays turn slowly, tracery brightens on hover and focus; all of it stops under reduced motion.
- **Decorative by default:** `aria-hidden`, never behind text, no pointer capture. Tests check the fold count of every ornament, that none is behind text, and the SVG weight: at most 6 KB per ornament and 40 KB gzipped for the whole library.
- A seed gives each church and each book its own variation.

## 6. Asciify components: status
| Component | State |
|---|---|
| `artPanel`, `decode`, `statusOrb`, `odometer`, `blockChart` | done |
| `cursorTrail`, `beam`, `buttonLoading` | done (sign-in) |
| `toastStack`, `pill`, `skeleton` | done (users, members) |
| `slideToConfirm` + `disintegrate`, `dropzone`, `commandPalette` | done (codex removal, logo, Ctrl+K) |
| `morphField` | phase F (sigil morph) |
| `scramble` on menu links, `pageDissolve` between modules | phase F, only if the e2e specs stay green (the links keep their real text) |
| `globe` | only if the map intro is approved (assumed no) |
| `wordmark`, `tabs` | not used: `wordmark` draws large letters only; the admin menu is made of links the e2e specs rely on |
| `fieldBackground` 404 | the 404 uses the ornament illustration instead |

## 7. Church renders rebuilt from scratch
**Why the old ones feel simple:** they are one generic box-and-towers builder with three hand-set variations. More pixels or other colours cannot fix that; the geometry has to carry the real building.

**What the research found (and did not):** public sources for the three real churches are thin and partly contradictory. Reasonably reliable: the cathedral is Renaissance, 1561 to 1598, two towers, a crossing dome, about 67 by 31 m; Jesús (1618) has a cross plan, a hemispherical dome on a drum and two slender towers; Santa Lucía has a bell gable and no towers. Not verified: facade orders, niches, tower tiers, and the dimensions of the other two. Nothing unverified is invented. Fidelity works in three tiers:
- **Tier 1, scans (exact).** The admin uploads a .glb scan (phone apps such as Polycam, Luma or Scaniverse produce them). Rules: at most 1.5 MB, at most 80,000 triangles, Draco or meshopt accepted; a short guide in Configuración explains how to optimise one. A scan is shown as scanned. This is the only way to be exactly faithful for any church, in any faith.
- **Tier 2, authored models for the three pilot churches.** Built in code from a shared **facade kit** (orders and pilasters, round and pointed arches, niches, pediments, balustrades, bell gables, tiered towers with belfry openings, drums and domes with lanterns, buttresses, mouldings, rose windows) and checked against real photographs: free photos from Wikimedia Commons used as guides, not as textures, and any photos or plans supplied. Anything not verifiable is flagged as an interpretation in the code and on the church page.
- **Tier 3, typologies for every other church.** Nave, rotunda, portico and courtyard from the same kit, with the real footprint from OpenStreetMap when one exists (an optional "import footprint" action for the admin).
- **Budgets so it loads anywhere:** at most 40,000 triangles per authored model for the viewer and 3,000 for the map (two levels of detail), baked ambient occlusion in vertex colours, one tiny tileable stone normal map, no per-model image downloads, at most 250 KB of code for the whole kit, and a low tier that drops to the map level of detail.
- **Seed check:** the cathedral's seed point is about 75 m from its real footprint (OpenStreetMap way 31296521, about 20.9671, -89.6225); the other two are unverified. The seed coordinates are corrected against the map.
- **Look:** grey, matte and sculptural, soft light, baked occlusion, a dark plinth with an inscription (name and sigil). After the new geometry exists it is rendered in two or three finishes, the engraving in negative included, and the choice is made from real screenshots of the new models.
- **The view:** a fixed close-up of the front, seen from low down and looking up (the line to the top of the facade rises at about 45 degrees), a little to one side. It never turns and cannot be dragged. Without WebGL the text fallback stays. (Planta and alzado drawings were built and then discarded at the owner's request.)

## 8. Books
Greyscale only (the admin's chosen colour stays stored and is shown by its luminance), about 40% thinner, slightly varied heights. Details: spine bands, a stamped sigil seeded from the title, a tooled border, the title in Cinzel and a small ornament on the cover, drawn to canvas textures from the ornament library. A pointed-arch frame for the shelf; books lean and lift on hover. The PDF reader goes monochrome with the same frame.

## 9. The map: satellite view, with colour
- Satellite is the default: Esri World Imagery (no key; `arcgisonline.com` is already allowed by the CSP) with a labels layer on top (places and roads) so names stay readable, and a toggle to the street map. Full colour, no muting: the map is the one place with colour.
- Zoom limits follow the imagery's real resolution in Mérida; attribution stays.
- A monochrome atlas frame (hairline rules, corner marks from the ornament library), a north arrow with one tick (no cross-shaped compass rose), controls restyled to the system.
- Markers as a MapLibre custom layer inside the map's own WebGL context: a sigil badge on a plate with the name in Cinzel, and the church's low-detail model from zoom 15.5 (the names from zoom 15), so the three pilot churches show as models at the opening view.
- Selection, flight and arrival keep their logic and their e2e specs; tests keep tile requests stubbed so they never depend on the live server.

## 10. Phases (one PR each; advisor review before each merge)
Done: A system, B login, C public view, D admin Asciify, the Asciify batch. The books phase is named L so it does not clash with the finished B.
| Phase | Content | Checks |
|---|---|---|
| E. Monochrome | section 3: tokens, outcomes by words and shape, greys everywhere, ink mapping | contrast test with alpha compositing, full e2e |
| M. Satellite map | section 9 without the markers: imagery, labels, toggle, atlas frame, restyled controls | phase4 e2e with stubbed tiles, screenshots |
| F. Ornaments and Asciify pairing | section 5: SVG parts, arch-clipped fields, sigil morph, illustrations, 404, empty states, plus `scramble` and `pageDissolve` if the specs stay green | fold, aria-hidden and size tests, screenshots |
| R1. Facade kit and the cathedral | the kit, the cathedral model, two detail levels, seed coordinates fixed | geometry bounds and triangle budget tests, screenshots against references |
| R2. Jesús, Santa Lucía and the viewer | the other two models and the fixed low front view (done) | e2e, screenshots |
| L. Books | section 8 (done: greys, slimmer, sigil stamps, arch frame) | bookshelf tests, screenshots |
| S. Scans and typologies | tier 1 rules and guide, tier 3 typologies (done; the optional OSM footprint was left out) | upload tests, budget tests |
| H. Map markers | sigil badges and names, models from zoom 15.5 (done) | phase4 e2e |

## 11. Constraints (apply to every phase)
- Accessible names, roles and Spanish labels stay the same, so the Playwright specs keep working (they match on text and roles).
- Animated text (`decode`, `scramble`, `odometer`) is a visual layer: the final text is always in the DOM. A page transition never leaves two pages mounted.
- Inputs and buttons keep a 3:1 boundary.
- The production build is tested too, since the CSP applies only there.
- One Asciify surface (a full field) at a time, small components aside, paused off-screen, frame rate capped; Asciify code loads lazily; without WebGL or with reduced motion a still or plain markup shows and everything works.
- **WebGL context budget** (the leak test caps canvases at 4): public map 1 (markers inside it). Opening a church unmounts the map, as the app does today, so the church view is 1 shared by stage, planta and alzado, plus 1 for the book shelf, plus 1 only while an Asciify surface is on: 3 at most. Login 1 (the art panel; the small components share the kit's budget); admin 0 to 2.
- **No text over images.** Text never sits over an image, an ornament or an Asciify field. Church names over the satellite imagery sit on their own plate (section 9).
- Geometry bounds, as tested: a model fits a 20 by 20 by 30 m box centred at the origin with its base at y = 0, stays inside its triangle budget, has no NaN, and where real dimensions are verified its size is within 15% of them.
- Hatching, outlines and any engraving are done in the material (`onBeforeCompile`, `EdgesGeometry`), not with a post-process composer. The e2e checks that shaders compile and log no GL error; it never compares pixels.

## 12. Risks
- Fidelity depends on references: without photos or scans the authored models are interpretations, and the page says so.
- Imagery tiles are external: stubbed in tests, attribution kept, the street map is the fallback if imagery fails.
- Bundle: lazy chunks per feature, budgets checked per PR.
- Low-vision users: meaning never depends on colour alone.

## 13. Open choices
1. Photos, plans or scans of the three churches, even phone photos: they make the models far more faithful.
2. Globe intro before the map: assumed no.
3. Per-church sigil: generated from the name (assumed) or designed by each church later.
