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
npm run e2e:rooms # room shapes, fixed structures, 3D manipulation and photo comparison
npm run e2e:stacked # stacking, upper-row selection and layered kitchen designs
npm run e2e:resize # cabinet resize handles, measurements, Undo and phone touch
npm run e2e:ux    # desktop/phone usability, row visibility, gallery and touch targets
npm run build    # static files in dist/, with relative paths so they work from any folder
npm run render:kitchens # regenerate gallery images with the real 3D renderer (requires local Chrome)
```

On minimal Linux environments, use a UTF-8 locale for browser checks, for
example `LANG=C.UTF-8 npm run e2e`. Chrome running in the POSIX locale falls
back to `download` for filenames containing Serbian characters.
Set `KITCHEN_E2E_SMOKE=1` to exercise the editor/export/phone flows with one
gallery example instead of opening all 52; normal `npm run e2e` checks them all.

## Public app

Open [Kitchen Designer](https://bjankovic16.github.io/wood_work/).
Pushes to `main` run the unit tests, build the app and deploy it to GitHub Pages
through [the deployment workflow](.github/workflows/deploy-pages.yml).
Every pull request and push to `main` also runs all five browser suites in
headless Chrome through [the browser test workflow](.github/workflows/browser-tests.yml);
screenshots of a failed suite are attached to its run for a week.
The repository's Pages source must be **GitHub Actions**. Kitchen projects and
uploaded reference photos stay in the visitor's browser, not in the deployment.

## Quick start

1. The start panel shows three kitchens from the collection: click one to open
   it in 3D, or press **Shuffle ideas** to see three others (every kitchen is
   shown once before any comes back). **Choose a kitchen** opens the whole
   gallery, and **Start with my room** lets you enter inside measurements and
   add doors and windows. Use millimetres: 3 metres is 3000 mm. The start panel
   is optional and can be dismissed.
2. Find parts using the library search (for example `drawers 900`, `pantry`, or
   `600`) and category filter. Serbian search also works without accents.
   The library starts with eight **Most used** parts. Choose **Browse all parts**
   or search to reveal the full catalogue. In 3D, open it with **Add element**.
3. Use **Plan**, **3D**, and **Cut list** to arrange, preview and prepare the
   cutting list. Phones show these labels in a separate navigation row and keep
   the project name visible; advanced settings remain in **More**.
4. The plan starts with floor units; upper cabinets remain faint outlines without
   labels. Switch to wall units and choose one upper row at a time. **View**
   groups snapping, grid size and dimensions; **Settings** contains materials
   and construction. Room geometry and structures are under **Advanced room**.
5. The cut list starts with material totals and export. Supplier confirmations
   are a neutral **Before cutting** checklist, separate from problem badges.
   Plan and cabinet drawings are below the list in a collapsed overview.

The interface follows the browser's primary language: Serbian for Serbian
browsers, English otherwise. A language chosen manually is remembered.

## What it does

- **Plan**: drag or click cabinets from the library; they turn and snap
  against walls and neighbours. Move, resize, rotate, duplicate, delete,
  undo/redo, chained wall dimensions, floor/wall unit filter.
- **Ready-made layouts**: straight, L-shaped or U-shaped starter kitchens
  sized to the room.
- **52 kitchen inspiration designs**: open **Designs** (or **Kitchen designs**
  in the phone's More menu), then click an image to load that exact kitchen
  in 3D. Choose straight, L-shaped, U-shaped or island kitchens in a range
  of finishes, with open-shelf and drawer variations. Every image is rendered
  from the same preset data and 3D scene used by the editor, not a stock or
  imported Pinterest photo. Eighteen premium originals form **Warm contemporary**,
  **Dark luxury** and **Japandi** collections, with finish swatches and public
  Pinterest inspiration links. These are style interpretations, not exact
  reconstructions of the linked photographs.
  - **Framed kitchens** finds ten hand-composed examples inspired by warm
    neutral/timber references: Cashmere & walnut frame, Ivory & oak frame,
    Oak & stone frame, and Oak frame with island. Deep ceiling cupboards and
    real timber side panels surround recessed uppers; black appliances,
    handleless fronts and lit stone/wood backsplashes complete the niche.
    They open at the same front view shown in the gallery, and all cabinets,
    return panels and island modules remain individually editable. Dimensions
    are design estimates, not measurements recovered from the reference photos.
    Additional palettes include sage/oak, terracotta/oak, noir/walnut,
    espresso/walnut and sand/ash, with two more contrasting timber islands.
    **Walnut niche beside a chimney** leaves the wall structure clear of all
    three cabinet tiers. Search `chimney` (Serbian: `dimnjak`) to find it;
    its geometric gap is not a certified fire/heat clearance.
  - Search names, finishes and styles, combine collection/layout filters, or
    show designs no larger than your current room's width, depth and ceiling
    height. This compares dimensions, not polygon containment or automatic
    adaptation: opening a design still uses its own room. **Reset filters**
    restores the full collection. Compact options include Birch alcove and
    Velvet apartment. On phones, **Filter designs** reveals the optional
    controls so previews stay easy to reach.
  - A design replaces the room, units, finishes, construction settings,
    openings and extra pieces, keeping the project name. One Undo restores
    the previous kitchen. All units remain editable and generate cutting lists.
  - Finishes describe the 3D appearance, not a purchased board specification;
    choose actual materials before ordering. The separate **My room layout**
    option keeps the existing room and settings.
  - Run `npm run render:kitchens` after changing presets or the 3D renderer;
    the 52 generated gallery images in `public/kitchens/` ship with the app.
    Pass preset IDs to render only changed previews, for example
    `npm run render:kitchens -- chimney-frame sage-oak-frame`.
  - **Stacked uppers** includes the ten framed kitchens, all eighteen premium originals and Greige
    gallery, Ivory & oak, Olive & stone, and Walnut noir. They include two
    separately editable upper rows, full-height storage, lit display cupboards,
    handleless fronts and optional plinth lighting. They are interpretations
    of the style, not copies of reference photographs.
- **Stacked wall cabinets**: select a wall/display cupboard, upper corner, open shelf or
  tall housing and use **Add cabinet above** in its properties or 3D toolbar.
  Each added cupboard is an independent unit with its own cut parts, dimensions
  and finishes. Its back anchor stays aligned, it keeps at least 30 mm below
  the ceiling, and the complete insertion is one Undo step.
  - The operation explains blocked space or insufficient height rather than
    inserting overlapping cabinets. Manual height/position changes remain
    editable and are checked as usual. Wall fixings, opening systems, load
    ratings and appliance ventilation still require an installer specification.
  - In **Plan**, **Upper cabinet row** makes overlapping rows individually
    selectable. Full-height display cupboards remain visible across their
    height bands; selecting one in 3D preserves the active row when returning
    to the plan. Two, three or more rows are possible when the room allows.
    Multi-row PDF reports contain a floor plan and separate upper-row plans.
  - **Ceiling cupboards** in the library are 400 mm high and 560 mm deep;
    their elevation follows the room height with a 30 mm fitting gap.
  - Select a suitable base cabinet and expand **Three-tier kitchen** to add
    two upper rows above its connected straight run (or selected corner).
    Preview and edit both row heights/depths before applying. The full operation
    is one Undo step, keeps at least 450 mm above the worktop and 30 mm below
    the ceiling, and refuses blocked space without inserting a partial row.
    Hob/oven units are excluded from this shortcut; specify their upper cabinets
    and extractor clearances individually.
- **3D**: orbit around the kitchen; walls facing the camera are hidden.
  Choose from 15 front colors/woods, seven worktops and six handle finishes.
  Warm marble and travertine have procedural textures; choose a backsplash,
  switch warm under-cabinet or plinth lighting on, and style open shelves or glass
  cabinets with accessories. Click a unit to edit it.
  - Quick **3D / Front / Top** views in the toolbar above the viewport; the
    camera glides from one view to the next. **Tools** adds **Focus selected
    cabinet** and a selected-cabinet toolbar for move, rotate, copy and delete.
    Enable **Move** there and drag the X/Z handles: the same grid, wall faces and snapping rules as
    the plan apply, and a whole drag is one Undo step. Each stacked tier moves
    independently at its existing elevation. The visible cabinet stays aligned
    with its saved position even when snapping prevents movement. Escape,
    interrupted touch/pointer input or leaving the window cancels an unfinished
    drag without an Undo entry and leaves the camera usable. Invalid placements are
    highlighted in red and reported by Checks.
  - Style controls start closed to leave the room visible. Front and carcass
    finishes can also be chosen per unit, making two-tone kitchens possible.
    Appearance is not a substitute for specifying the actual purchased boards.
    Flat and Shaker-relief fronts are available; the relief is a visual preview,
    while the cutting list gives blanks rather than machining or joinery drawings.
    The 3D canvas renders on demand rather than continuously while idle.
- **Photo studio**: a separate tab in **Kitchen designs** shows credited original
  reference photos beside the renderer-derived previews of editable interpretations.
  Open one to compare the original photo alongside live 3D. The model's dimensions
  and details are estimates, not an automatic or exact reconstruction.
  Interpretations open as new projects, preserving the current kitchen and starting
  from the perspective camera used by their previews.
  - A photo you own or have permission to use can be attached to any kitchen,
    with an optional original-source or Pinterest link. JPEG, PNG and WebP files
    up to 15 MB are resized/re-encoded to a bounded browser-local image; the photo
    is included in project JSON files, not uploaded to a service.
    Switching projects, closing the photo panel or removing the reference cancels
    a pending photo change, so a late upload cannot alter another kitchen.
  - Starter photographs: [White Wooden Cupboards, Mark McCammon](https://www.pexels.com/photo/white-wooden-cupboards-2724749/)
    and [Modern Kitchen Interior with Warm Lighting, DOAN THANH BINH](https://www.pexels.com/photo/modern-kitchen-interior-with-warm-lighting-36887742/),
    used under the [Pexels License](https://www.pexels.com/license/). Photographer
    credit and original-source links remain visible in the app.
- **More kitchen parts**: 52 library choices, including ceiling cupboards, wide drawer units,
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
  - *Visual overview*: the current kitchen plan and a selectable, dimensioned
    front-view diagram of each cabinet. **By unit** pairs every cabinet's
    diagram with its cut parts; extra pieces remain listed in both groupings.
    Drawings follow cabinet settings, not manual panel-size overrides.
    Overall cabinet dimensions are clearly separated from panel cut sizes,
    and design warnings are available before manufacturing.
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
  - In **3D**, click a door/window or choose it from **Doors, windows & structures**,
    then use **Move room object**. The level handle slides it along its wall;
    windows also have an upright height handle, while doors stay on the floor.
    Angled walls and either face of an interior partition are supported.
    **Edit room object measurements** changes exact sizes, sill, offset or wall.
    Opening frames stay visible when the near wall is hidden so they remain
    selectable. These diagrams are not door-swing or glazing specifications.
- **3D toolbar**: a slim toolbar docked above the viewport, never over the
  kitchen, holds what is used all the time: **Style**, the **3D / Front / Top**
  views, **Open all**, **Interior view** and **Photo**. **Tools** opens the
  rarely needed tools: the selected-cabinet toolbar with handle-based Move and
  Resize, the list of doors, windows and structures, and a short how-to. On
  phones the toolbar is icons only and Interior view, Photo and Reset view sit
  under **Tools**. A door, window or structure selected in 3D shows its own
  actions straight away.
- **Move cabinets by dragging them** in 3D. With a mouse, press any cabinet and
  drag; an outline shows which cabinet is under the pointer. On a touch screen
  a swipe turns the view as it does anywhere else, so rest a finger on a
  cabinet for a moment to pick it up, or tap it first: the selected cabinet and
  its **Move** hand button move at once.
  - The point you grabbed stays under the pointer. Seen from above the cabinet
    follows freely across the floor; seen level, as with wall units at eye
    height or the Front view, it slides sideways only, so a pixel of drift can
    never throw it across the room.
  - A cabinet keeps to its wall until it is clearly pulled away, and does not
    turn onto the next wall by itself when slid into a corner.
  - While you drag, blue measurements show the free space left on each side,
    to the next unit or wall. Snapping and the grid are the plan's; one drag is
    one Undo step; Escape or an interrupted gesture puts the cabinet back.
  - Click **Move** (without dragging) for arrow buttons that move in exact 10,
    50 or 100 mm steps. The arrows, and the keyboard's arrow keys, move the
    cabinet the way they point on screen, however the view is turned.
  - Click or tap a cabinet for its resize arrows as well: drag one out to
    expand or in to shrink along the direction it points.
- **Open a cabinet**: double-click it, or select it and press **Open**. Doors
  swing open and drawers slide out, lower drawers further than the ones above,
  so every drawer shows its inside. The camera glides to a three-quarter view
  of the cabinet (from above for floor units, from eye level for wall and tall
  units) and glides back when the last open cabinet is closed. **Open all** in
  the toolbar opens or closes every cabinet without moving the camera. Opening
  is a view-only preview: it does not change dimensions or cutting quantities.
  Animations are skipped when the system asks for reduced motion.
- **See inside cabinets**: turn on **Interior view** in the toolbar (under
  **Tools** on phones) to hide
  fronts and reveal shelves, corner compartments and drawer boxes. Toggle it off
  to restore the finished kitchen. This schematic view does not change the
  project, Undo history or cutting list; appliance interiors and fitting details
  are not modelled.
- **Resize cabinets in 3D** to a chosen dimension: open **Tools**, select a cabinet, choose **Resize**, then choose
  Width, Height or Depth (corner units also offer the second arm). Drag the
  handle out to expand or in to shrink, with live measurements.
  The back-left anchor and elevation stay fixed; size limits, the room outline
  and ceiling constrain the change. Grid snapping follows the plan setting.
  Use the pencil for exact dimensions, **Done** to exit, **Undo** to restore a
  completed drag, or Escape to cancel an unfinished drag. Mouse and touch work.
  Other cabinets are not moved; review collision warnings before cutting.
- **Irregular rooms**: rectangular, L-shaped/stepped and diagonal-corner
  footprints, editable polygon rooms with multiple diagonal walls, plus
  full-height chimneys, columns and wall projections.
  Structures reserve space but are not cabinet parts. Automatic placement
  avoids them; manual conflicts remain visible as explicit design-check errors.
  The plan, 3D view, PDF plan and saved project all use the same room geometry.
  Active chimney fire/heat clearances must be specified with a qualified installer;
  the room model is not a fire-safety calculation.
  - In **3D**, select a chimney, column or wall projection, then use
    **Move room object** to drag the X/Z floor handles with a mouse or touch.
    Grid snapping follows the plan's Snap setting. Dragging cannot put the
    structure outside the room outline; cabinets are not moved automatically,
    and conflicts remain in Checks. Exact dimensions and positions are available
    through **Edit room object measurements**. Each drag is one Undo step;
    Escape, lost pointer capture or an interrupted gesture cancels the move.
  - Room setup includes **L-shaped room + chimney** and **Diagonal corner + column**
    examples, each opened in a new project without replacing the current one.
  - Under **Walls & angles**, select a wall to edit its length/angle or add/remove
    a corner. **Edit wall corners on plan** lets you drag shared corners;
    Escape cancels the gesture. A length/angle change moves the wall's end
    corner and adjoining edge, keeping the room closed. Invalid/self-crossing
    shapes are rejected. Room width/depth bound the editing area; they do not
    stretch a custom polygon. Existing cabinet conflicts remain visible in Checks.
  - Cabinets accept arbitrary angles and snap their back to diagonal walls.
    Resizing and stacking retain that back anchor. Quick rotate buttons still
    turn by 90 degrees. L-shaped cabinet carcasses remain intrinsically
    right-angled; custom mitres and nonrectangular worktop cuts need separate
    fabrication drawings.
  - **Interior & half-height walls** adds partitions with editable endpoints,
    angle, length, thickness and height. Both faces support snapping; collision
    checks consider height, so cupboards above a low wall remain possible.
    Doors and windows can attach to angled outer walls and partition faces.
  - **Wall panels & backsplash** adds independent wall-attached visual finishes
    with a material, span, elevation and height. Wood/stone treatments are
    clipped around openings and replace automatic backsplash where they overlap.
    Like partitions, these are not manufactured cabinet parts or cutting-list
    quantities. Remove a wall's attachments before deleting their wall.
  - Existing rectangular/cut-out projects migrate when first edited as polygons,
    preserving opening positions. New angle/wall data is saved in project format
    version 5; older app versions cannot read all new geometry.
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
| `scripts/*.mjs` | Desktop and phone browser regression tests, gallery-image renderer |

## Conventions

- Enter dimensions in integer millimetres; rotated anchors and geometric wall
  lengths may be fractional. Cut sizes are rounded to 0.1 mm.
- Plan coordinates start at the inner top-left corner of the room; x grows to
  the right and y grows downwards.
- Each unit stores the top-left corner of its footprint (`x`, `y`), its
  clockwise `rotation` in degrees (0 = back parallel to the top wall),
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
