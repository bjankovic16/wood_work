# Kitchen Designer

Design a kitchen the way IKEA's planner works: drag cabinets onto a room
plan, see it in 3D, pick fronts and worktops. Unlike IKEA, the app also
works out every board to cut. The full requirements are in
[docs/SPEC.md](docs/SPEC.md).

## Running it

```bash
npm install
npm run dev      # http://localhost:5173 (also reachable from other devices on the same network)
npm test         # unit tests: geometry, snapping, layouts, construction engine, cutting list
npm run e2e      # drives the app in the locally installed Chrome, desktop and phone; screenshots go to test-results/
npm run build    # static files in dist/, with relative paths so they work from any folder
npm run render:kitchens # regenerate gallery images with the real 3D renderer (requires local Chrome)
```

## Quick start

1. Choose a ready-made kitchen from the start panel, or choose **Start with my
   room** to enter inside measurements and add doors and windows. Use millimetres:
   3 metres is 3000 mm. The start panel is optional and can be dismissed.
2. Find parts using the library search (for example `drawers 900`, `pantry`, or
   `600`) and category filter. Serbian search also works without accents.
   Specialist storage, appliances and island sections start collapsed; searching
   reveals matching parts automatically, without removing any advanced choices.
3. Use **Plan**, **3D**, and **Cut list** to arrange, preview and prepare the
   cutting list. Phones show these labels in a separate navigation row and keep
   the project name visible; advanced settings remain in **More**.

## What it does

- **Plan**: drag or click cabinets from the library; they turn and snap
  against walls and neighbours. Move, resize, rotate, duplicate, delete,
  undo/redo, chained wall dimensions, floor/wall unit filter.
- **Ready-made layouts**: straight, L-shaped or U-shaped starter kitchens
  sized to the room.
- **20 kitchen inspiration designs**: open **Designs** (or **Kitchen designs**
  in the phone's More menu), then click an image to load that exact kitchen
  in 3D. Choose straight, L-shaped, U-shaped or island kitchens in a range
  of finishes, with open-shelf and drawer variations. Every image is rendered
  from the same preset data and 3D scene used by the editor, not a stock or
  imported Pinterest photo. The gallery also links to Pinterest for more ideas.
  - A design replaces the room, units, finishes, construction settings,
    openings and extra pieces, keeping the project name. One Undo restores
    the previous kitchen. All units remain editable and generate cutting lists.
  - Finishes describe the 3D appearance, not a purchased board specification;
    choose actual materials before ordering. The separate **My room layout**
    option keeps the existing room and settings.
  - Run `npm run render:kitchens` after changing presets or the 3D renderer;
    the twenty generated images in `public/kitchens/` ship with the app.
- **3D**: orbit around the kitchen; walls facing the camera are hidden.
  Choose from 15 front colors/woods, seven worktops and six handle finishes.
  Warm marble and travertine have procedural textures; choose a backsplash,
  switch warm under-cabinet lighting on, and style open shelves or glass
  cabinets with accessories. Click a unit to edit it.
- **More kitchen parts**: 46 library choices, including wide drawer units,
  pull-out baskets, pantry sizes, open shelves, glass display cabinets,
  oven towers, separate hob cabinets, integrated fridge housings, extractor
  hoods, island drawer units and breakfast bars. Island and bar presets try
  the room centre first; all modules can be dragged, resized and rotated.
  - Glass doors use separate unbanded glass blanks and glass hinges, not MDF
    door panels. Breakfast bars have a real 38 mm top and purchased support legs.
    Required specialist stock is added to older projects when needed.
  - Oven/fridge housings have no back panel for ventilation; towers have
    two oven-support shelves. Appliances and pull-out systems appear in
    the hardware/shopping list. Confirm niches, loads, ventilation,
    fixings and glass specifications with the manufacturer before production.
  - Lighting, backsplash and decorative accessories are visual references,
    specified separately rather than silently counted as cabinet boards.
- **Units**: doors, drawers and shelves; full-overlay or inset fronts; hinge side;
  equal drawers or a shallow top drawer; a front-view preview; the unit's own
  parts list; a different board for any one unit.
- **Kitchen settings**:
  - *Materials and edges*: a library of boards (thickness, sheet size, grain,
    price) and edge bands; which ones the carcass, backs and fronts use; which
    edges are banded; optionally cut parts smaller by the band thickness.
  - *Construction*: bottom/top joints, rails or full top, nailed or grooved
    backs, door type, front gaps, shelf setback, wooden or metal drawers.
- **Cutting list**: every piece, identical pieces grouped, banded edges per
  piece; per board the area, sheets needed and cost; edge banding in metres;
  the hardware list (hinges, slides, handles, legs, shelf pins, hangers).
  - *Changes by hand*: in the "By unit" view, any piece's quantity, size or
    board can be changed (0 leaves it out); changed values are marked and can
    be put back. A change stops applying once the unit itself changes the piece.
  - *Extra pieces*: anything the units do not include, with its own board and
    edge banding, counted in all totals.
  - *Export*: a PDF cutting list (plan, board totals, construction summary,
    parts, hardware, parts by unit), an Excel workbook (parts, by unit,
    materials, hardware, project), CSV, a copy for pasting into a
    spreadsheet, and print.
- **Projects**: several kitchens, each saved in the browser as you work; open,
  copy, delete, save one to a file and open it again (also on another
  device).
- **Languages**: Serbian (Latin script) by default, English as an option
  (top bar, or the "More" menu on phones). Everything follows the language:
  part names, hardware, checks, the PDF, the Excel file and the CSV (with a
  decimal comma in Serbian). New units get Serbian codes (D1 donji, G1
  gornji, V1 visoki, …). Built-in boards are shown in the chosen language
  until you rename them.
- **Checks**: overlapping units, units through the ceiling, gaps that need a
  filler, doors that will sag, drawers that cannot be built, wall units hung
  too low, parts larger than a sheet, units blocking a door or covering a
  window, a fridge next to the oven.
- **Windows and doors** in the walls, shown on the plan and in 3D; new units
  are placed clear of them.
- Works on phones: full-screen plan, pinch to zoom, panels slide up from
  the bottom.

## Status

- [x] **Phase 1**: interface, plan canvas, library, editing, room size
- [x] **Phase 2**: construction rules, panel calculations, unit properties, cutting list
- [x] Beyond the plan: 3D view with finishes, ready-made layouts, phone layout
- [x] **Phase 3**: door and drawer options, materials library, edge banding, hardware, checks, windows and doors
- [x] **Phase 4**: PDF and Excel export, changes by hand and extra pieces, several projects, polish

## Layout of the code

| Folder | What is in it |
|---|---|
| `src/domain/` | Data model, element catalogue, plan geometry, snapping, automatic placement, dimension chains, ready-made layouts, finishes. No React. |
| `src/engine/` | The construction engine: per-unit configuration, front layout, every part's cut size, the grouped cutting list. Deterministic, no React. |
| `src/export/` | PDF (pdfmake) and Excel (exceljs) cutting lists and the plan drawing for the PDF. Both libraries load only when a file is made. |
| `src/i18n/` | Every word of the interface, in English (`en.ts`, which defines the shape) and Serbian (`sr.ts`, `srEngine.ts`); the compiler checks that Serbian has every entry. `useT()` gives a component the words for the chosen language. |
| `src/store/` | Zustand stores (the design with undo history, UI state), projects (saving and loading), user commands, viewport maths |
| `src/components/` | React UI: library, plan canvas (react-konva), 3D view (react-three-fiber, loaded on demand), properties, construction dialog, cutting list, projects, phone layout |
| `scripts/e2e.mjs` | Browser test |

## Conventions

- All lengths are integer millimetres; cut sizes are rounded to 0.1 mm.
- Plan coordinates start at the inner top-left corner of the room; x grows to
  the right and y grows downwards.
- Each unit stores the top-left corner of its footprint (`x`, `y`), its
  `rotation` (0 / 90 / 180 / 270: the wall its back faces, 0 = top wall),
  `width` along the front, `depth` (of the side panels) from back to front,
  `height`, and `elevation` from the floor to its underside. Corner units
  also have `width2`, the length of the arm along the second wall. Doors,
  drawers, shelves and thicknesses are stored only when they differ from the
  defaults.
- In a cutting list row, the length is the side the grain runs along. For
  calculated pieces it is always the longer side; pieces changed or added by
  hand keep their sizes as typed.
- Changes by hand are stored per unit, keyed by the piece's name, note and
  calculated size, so they lapse when the unit is resized. The key always
  uses the English name, so changes survive switching the language.
- The engine never hard-codes words: pieces, notes and fittings are codes,
  and the text comes from the labels passed in (`src/engine/labels.ts`,
  English by default).
- Units at 1000 mm or more above the floor count as wall units.
# wood_work
