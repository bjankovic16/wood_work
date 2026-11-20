# Kitchen Designer

Measure your room in 2D, try kitchens in that room and generate a cutting
list from your cabinet construction settings. The floor plan, inside view
of each wall and interactive 3D editor all use the same project. You can
give a customer a view of the finished kitchen without sending the editable
project. See [the specification](docs/SPEC.md) for the design rules.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173 (also reachable from other devices on the same network)
npm test         # unit tests: geometry, snapping, layouts, construction engine, cutting list
npm run e2e      # drives the app in the locally installed Chrome, desktop and phone; screenshots go to test-results/
npm run e2e:rooms # room shapes, fixed structures, 3D selection and photo comparison
npm run e2e:room-workspace # room-first workspace on desktop and phone
npm run e2e:ideas # apply ideas in empty and furnished rooms
npm run e2e:customer # open the downloaded customer HTML offline; check controls and image fallback
npm run e2e:stacked # stacking, upper-row selection and layered kitchen designs
npm run e2e:resize # cabinet resize handles, measurements, Undo and phone touch
npm run e2e:sheets # phone sheet gestures, keyboard controls, repeat Add and material pickers
npm run e2e:ux    # desktop/phone usability, row visibility, gallery and touch targets
npm run e2e:feedback # five-second Undo, backup confirmation and sharing
npm run e2e:offline # build under the Pages path, then use 3D and export with the network off
npm run profile:move # profile mouse/touch placement on the 2D plan in the chimney-frame kitchen
npm run build    # static files in dist/, with relative paths so they work from any folder
npm run render:kitchens # regenerate gallery images with the real 3D renderer (requires local Chrome)
```

On minimal Linux environments, use a UTF-8 locale for browser checks, for
example `LANG=C.UTF-8 npm run e2e`. Chrome running in the POSIX locale falls
back to `download` for filenames containing Serbian characters.
After `npm run build`, run
`LANG=C.UTF-8 KITCHEN_E2E_PRODUCTION=1 npm run e2e:resize` to also check an
actual resize against the production assets, without development test hooks.
Set `KITCHEN_E2E_SMOKE=1` to exercise the editor/export/phone flows with one
gallery example instead of opening the whole collection; normal `npm run e2e` checks them all.

`npm run profile:move` replays a 2D cabinet move with mouse and touch. It
reports frame times (95th percentile and worst frame) and counts placement,
validation and save calls during the drag and at release. For timing without
call-count instrumentation, use `PROFILE_TIMING_ONLY=1 npm run profile:move`.
Compare runs on the same device and browser.

## Public app

Open [Kitchen Designer](https://bjankovic16.github.io/wood_work/).
Pushes to `main` run the unit tests, build the app and deploy it to GitHub Pages
through [the deployment workflow](.github/workflows/deploy-pages.yml).
Publishing waits for the build job's uploaded artifact. If only publishing
fails, use **Re-run failed jobs** on the current `main` run to reuse that build.
If the artifact has expired or `main` has moved on, use **Run workflow** on
`main` instead of redeploying an older commit.
See [the browser test workflow](.github/workflows/browser-tests.yml) for the
suites run on pull requests and pushes to `main`; screenshots of a failed
suite are attached to its run for a week.
The repository's Pages source must be **GitHub Actions**. Kitchen projects and
uploaded reference photos stay in the visitor's browser, not in the deployment.

## Quick start

1. On your first visit or in a new project, **Room** (**Prostorija**)
   opens in 2D. Enter inside measurements in millimetres (3 metres = 3000 mm).
   Returning to a saved project resumes it. To measure a different room, choose
   **Projects → Start fresh**. It opens a new empty kitchen; your previous kitchen stays in
   **Projects**. To remeasure the *same* kitchen, choose **1 Room**.
2. Tap the **Wall view** icon beside a wall to open its inside elevation, or tap its
   **number** to edit the measurement. The wall line also opens the inside view.
   The dropdown with the little floor plan lets you switch directly
   to any wall. In the wall view, choose **Add → Window** or **Door** and
   measure from the green start point. Add a chimney if needed. The
   selected object's measurements appear just below the room measurements.
   See [Measuring the room](#measuring-the-room) for diagonals and keyboard input.
3. In Room, choose **Room model / Model prostorije** to see just the room,
   with dimension labels and a scrollable **Room measurements** list. It covers
   floor area, ceiling height, every wall (including diagonals), openings,
   fixed structures, partitions and wall finishes. The same **Wall view** icon
   opens a wall from its 3D label or its row in the list. On desktop, **3D preview**
   also shows the room beside the drawing. The top-level **3D** tab always
   shows the furnished kitchen in the same project. Choose
   **Layout →** to open the drawing, then choose **Start from an idea**
   to [try an idea in your room](#trying-an-idea-in-your-room). A measured
   empty project reopens in Layout. **Add cabinets yourself** opens the phone picker
   or focuses the laptop's cabinet library. A new project still starts with measurements.
4. **Position objects in 2D only:** move cabinets and structures on the plan
   and slide openings in their wall elevation. In **3D**, drag to orbit and
   scroll or pinch to zoom. You can select, preview, change finishes and
   resize a cabinet with its dimension handles, but dragging its body never
   moves it. Use the curved-arrow **Undo** and **Redo** buttons on phones;
   desktop Undo keeps its text label. A completed edit or applied idea is one
   step. Camera gestures add no step.
5. For a customer, [export the 3D view as one HTML file](#sending-a-customer-the-3d-view).
   For the workshop, use **Cut list**: review checks and material totals,
   then export the cutting list. The plan and cabinet drawings are below it.

The interface follows the browser's primary language: Serbian for Serbian
browsers, English otherwise. A language chosen manually is remembered.

**Find your next step:** the numbered destinations are **1 Room → 2 Layout → 3 3D →
4 Cut list**. On a phone, go from Layout to **3D** and then **Cut list** using
the bottom tabs. Neither workspace has an extra navigation row.
The last step offers **Export**, not a project switch. For a guide to all four steps,
choose **Help** on a laptop or **⋯ → Planning guide** on a phone.

**Keep a copy:** Projects are stored in this browser, not in an account. In
**Projects**, save a project file you can import on another device. Each project
shows its last confirmed file backup and flags edits since that backup or a
backup at least a week old. If the browser only starts a download, check the
file before choosing **I saved the file**. Keeping browser storage or installing
the app is not a substitute for a backup. After
one complete online load, the production app can reopen and work offline,
including the plan, 3D and workshop exports.

**Try a different layout:** open **Compare layouts / Uporedi rasporede** from
the guide or **Projects**. **Edit a copy of this kitchen** opens a separately
named variant with the same room, cabinets and finishes. After editing, compare
it with the original: both plans use the same scale, alongside floor area, unit
count, cut pieces and net board area (not purchased sheet area). Comparing
does not switch projects or change either design.

## Measuring the room

- In **Room**, use **Dimensions** for room size and wall geometry, **Objects**
  to find an existing opening or structure, or **Paint & tiles** to change walls and floors
  right on the plan. On phones these are expandable sections below the drawing.
  Use the drawing picker to switch between the room outline, a wall and the room model.
- **Walls:** perimeter segments are numbered in order: Wall 1–4 in a rectangle,
  continuing around longer outlines. Select one to see its starting end. To
  change **Wall length**, click or tap the dimension, or focus it with Tab and
  activate it with Enter or Space. You can type the same value in the panel.
  **Height to ceiling** is measured from the floor. Entering an exact wall
  length keeps a rectangular room rectangular.
- **Drag a corner:** in **Room → Room outline** (**Prostorija → Obris prostorije**), grab the dot where two exterior walls meet. Only that corner
  moves, even in a rectangle. Watch the two wall lengths and floor area as
  you drag. A corner stops before the outline crosses itself, cuts through a
  cabinet, or leaves too little wall for a door or window. One **Undo** restores
  the room. You can also Tab to a corner and use the arrow keys (10 mm, or
  100 mm with Shift), or tap a wall's number to enter an exact measurement.
- **Wall elevation:** tap the wall's **Wall view** shortcut or choose it in **Drawing view**.
  The mini-plan marks which wall you're facing. **Left** and **Right** below the
  drawing tell you which wall meets each end; tap either to open it. An
  unattached partition end reads **Free end**. In **Dimensions**, turn on **Show kitchen outlines for
  reference** to see cabinets on the plan or against the current wall. Tap a perimeter
  wall's length or height to edit it. Use **Add → Window** or **Door**, then drag the opening with mouse or touch,
  or type its width, height and distance **from the marked start** to its
  near edge. A window also has a sill height (floor to bottom of frame);
  doors stay at floor level. Select an opening to see dimension lines outside
  the wall face: offset and width below, height and window sill to the right.
  The values are in millimetres and follow the opening as you drag.
- **Chimney:** choose **Against wall**, then enter **Length along wall**,
  **Projection into room** and the offset from the marked start. Choose
  **Free on plan** to position it away from a wall. Placement uses the actual
  outline, including diagonal walls, not just the room's width and depth.
  On the plan, nudge a selected structure with the arrow keys (10 mm;
  Shift + arrow: 100 mm). An attached structure moves along its wall. You
  can also use touch and the measurement fields without a keyboard.
- A new object is selected immediately. Its card sits directly below the room
  measurements on desktop and in the same section on a phone. Read its sizes
  and clearances in 2D or 3D. To change its position from a 3D view, use
  **Edit position in 2D**; switching views keeps the selection.
  Old projects retain the positions of their openings, including on the
  bottom and left walls.

## Trying an idea in your room

Choose **Start from an idea** in an empty Layout. You can also open **Ideas** in
the desktop top bar or the phone's **⋯** menu. **Starter layouts** contains the
straight, L-shaped and U-shaped arrangements, not a second copy of your room. The size filter
starts on; clear it to browse larger originals as well. Click any card or
photo to review it in **your** room. Open the pictured original in a separate
project via **⋯**. **Reorder ideas** only reorders the gallery. **Apply a style to my kitchen** cycles looks on installed cabinets,
or opens a layout review if the room is empty.

| What's already in the room? | What happens when you apply an idea? |
|---|---|
| **No kitchen elements** (doors, windows and chimneys don't count) | Get a proposed arrangement fitted to the usable wall segments, not a copy of the example room. New cabinets generate their own cut parts. |
| **One or more kitchen elements** | Change the **look only**. Every unit keeps its ID, position, dimensions, rotation and elevation. No rows, islands or units are added or removed; boards, thicknesses, manual part edits and the cutting list stay the same. |

For an empty room, check the **Fit to my room** sketch before choosing
**Apply this layout**. Tap a numbered wall or use **Main wall**, then for an L choose **Left return** or
**Right return** as if facing that wall from inside: left joins its marked
start, right joins its end. Only the furniture changes sides. The fit accounts
for doors, window sills, chimneys, partitions and angled walls, and reserves
at least 900 mm on all sides of a proposed island. It uses allowed cabinet
widths and fillers, not scaled-down appliances. **Adjustments** lists resized,
added and omitted parts. The same **Checks** used in the editor run before
confirmation with your actual boards and custom pieces. A remaining issue is
listed, not counted as a clean fit. If the arrangement cannot fit, you get a reason and nothing is
placed. Confirm utility connections and supplier clearances before building.

**Randomize finishes** uses the same finish transfer as an idea: fronts and their
profile, carcasses, handles, worktop, window frames, door frames and leaves.
Base units, towers, upper rows, islands and side panels take the corresponding
finishes, so a two-tone design can stay two-tone. Plinths follow their cabinet
fronts; wall paint, floor finishes and existing cladding stay as they are.
Edit individual finishes afterwards, or use **Undo** to restore the previous look.

To see the exact example behind a thumbnail, choose
**Open original in a separate project**. Explore its prepared room and
cabinets, then return to your kitchen in **Projects**. This option is
separate from applying the idea.

## Sending a customer the 3D view

1. In the furnished kitchen's **3D** workspace, choose **Share**. Send the
   self-contained HTML through the device's share sheet when available, or
   save the file and send it yourself. If preparation outlasts the original
   tap, tap **Share file** to open the native chooser. Cancelling never starts
   a download. Desktop **3D → Tools** also offers the direct HTML export.
2. The customer opens the file locally in a browser. Drag to rotate, scroll
   or pinch to zoom, and use **Reset view** to return to the starting angle.
   If interactive 3D is unavailable, the file displays an explanation and an
   embedded image instead.

The model, textures and viewer are inside the file. It makes no external
network requests. No installation, account, hosted project or separate model
file is needed. The export includes all walls, even ones cut away for the
current camera.
It omits selection and editing tools, dimensions, reference photos, prices,
cutting lists and editable project JSON. Use a project file to continue editing,
or a cutting-list export for the workshop; the customer view is neither.

## Planning and cabinet features

- **Layout**: drag or click cabinets from the library; they turn and snap
  against walls and neighbours. Start with the eight **Most used** parts,
  choose **Browse all parts**, or search the catalogue by name or width
  (e.g. `drawers 900`). Serbian search works without accents. On the plan, drag a
  cabinet to move it, nudge it with the arrow keys, or type its exact position
  in its properties. To move it without dragging or snapping to a wall, choose
  **Move**, then click or tap where its centre should go. An occupied spot is
  rejected without changing the layout. You can also resize, rotate, duplicate or delete a unit.
  Release to commit a changed drag in one Undo step; Escape or an interrupted
  touch restores the starting position without a step. **All** is the initial
  layer: upper units are dashed outlines, and a click or tap on stacked units
  picks the floor cabinet. Hover to see its full name on desktop, or tap to see
  it in the cabinet sheet on a phone. Choose **Wall units**
  and, if needed, **Upper cabinet row** to edit an upper tier and see its measurements.
  A drag isolates its layer until release or cancellation. On a phone,
  pinch to zoom or tap **Fit** to see the whole room again. The drawing shows
  totals and the selected unit by default; turn on all measurements for more detail.
  Drag the cabinet sheet's handle or focus it and use the arrow keys to change its height.
  Home/End choose small/full; swipe down from small or press Escape to close.
  On desktop and phone, edit **Size**, **Fronts**, **Materials** or **Parts**
  without scrolling through the other sections. Use the common-size buttons
  for exact dimensions; stacking is at the end of **Size**.
  **Add element** shows a rendered picture of each preset. Tap a picture to add
  it immediately, or turn on **Preview before adding** to rotate the element in
  your kitchen's finishes before you commit. Catalogue pictures use a sample
  finish and remain available offline, even without WebGL. Regenerate them
  with `npm run render:elements` after changing the presets or furniture model.
  The phone Add sheet stays open so you can add several units in a row. On a phone,
  choose **Edit on plan** (**Na crtež**) after a pick to edit that cabinet without
  opening a form. Drag its body to move it, a side edge for width or the front
  edge for depth. On small footprints the square grips sit just outside the unit
  so you can still grab its middle. For exact values use **Resize** instead.
  Switch to wall units to work on
  one row at a time. **View** groups snapping, grid size and dimensions;
  **Settings** contains materials and construction.
- **61 kitchen designs**: browse straight, L-shaped, U-shaped and island
  kitchens. The thumbnails show the **original models**, not a prediction of
  the fit in your room and not photographs. Eighteen premium originals form
  **Warm contemporary**, **Dark luxury** and **Japandi** collections.
  **Apply a style to my kitchen** cycles through the gallery without repeating an idea until
  the collection has been visited. Close cabinet previews and finish resizing
  before using it.
  - **Basil & graphite / Bosiljak i grafit** is a green U-shaped kitchen with an
    under-counter oven, inset sink, oak niche and floating shelves. Select the
    card to review it in your room, or use **⋯ → Open original in a separate
    project** for the pictured composition. The reference paint, floor tiles and
    accessories are optional; existing room finishes are kept unless you opt in.
  - Open **3D** on your own kitchen to see its finished surfaces immediately.
    In **Perspective**, grain follows each shelf, stone continues across worktop
    joins and metal catches the light as you orbit. Sinks have an inset bowl,
    Shaker fronts are recessed, and open shelves are darker at the back. No idea
    or style change is needed; dimensions and cuts stay the same. **Studio** shows
    the same kitchen with different framing and a charcoal background. **Front**
    and **Top** stay simple for inspection. **Share** keeps the detailed finishes,
    including in the offline customer file.
  - Eight additional timber-and-green kitchens include four reference-inspired
    layouts: an olive/oak L with a glass display, a compact olive/oak corner,
    eucalyptus/walnut cabinetry, and a straight olive run by a window. Forest,
    sage/ash, cashmere/walnut and terracotta/oak variants add further choices.
    All models use editable cupboards, not the reference photographs as geometry.
  - **Framed kitchens** finds ten hand-composed examples inspired by warm
    neutral/timber references: Cashmere & walnut frame, Ivory & oak frame,
    Oak & stone frame, and Oak frame with island. Deep ceiling cupboards and
    real timber side panels surround recessed uppers; black appliances,
    handleless fronts and stone/wood backsplashes complete the niche.
    In the original project, cabinets, return panels and island modules
    remain individually editable. Dimensions
    are design estimates, not measurements recovered from the reference photos.
    Additional palettes include sage/oak, terracotta/oak, noir/walnut,
    espresso/walnut and sand/ash, with two more contrasting timber islands.
    **Walnut niche beside a chimney** leaves the wall structure clear of all
    three cabinet tiers. Search `chimney` (Serbian: `dimnjak`) to find it;
    its geometric gap is not a certified fire/heat clearance.
  - Search names, finishes and styles, combine collection/layout filters, or
    show designs no larger than your current room's width, depth and ceiling
    height. This filter compares the examples' overall dimensions; it doesn't
    decide what can fit between your door and chimney. That's checked when
    making a proposal for an empty room. **Reset filters**
    restores the full collection. Compact options include Birch alcove and
    Velvet apartment. On phones, **Filter designs** reveals the optional
    controls so previews stay easy to reach.
  - **Stacked uppers** includes the framed kitchens and premium originals,
    as well as Greige gallery, Ivory & oak, Olive & stone and Walnut noir.
    Their upper rows, full-height storage and display cupboards are editable.
  - Run `npm run render:kitchens` after changing presets or the 3D renderer;
    the generated gallery images in `public/kitchens/` ship with the app. Pass
    preset IDs to render only changed previews, for example
    `npm run render:kitchens -- chimney-frame sage-oak-frame`.
- **Wall and floor colours**: in **Room → Paint & tiles** (**Prostorija → Boje i pločice**),
  pick a swatch or a
  custom colour for all painted walls, and another for the floor. Changes appear
  in 3D, persist with the project and support Undo. Backsplashes and wall cladding
  retain their own finishes; room colours do not change the cutting list.
  Enable **Floor tiles** (**Podne pločice**) for square tiles, choose a side
  length from 100 to 1200 mm and a separate grout colour. Tile colour follows
  the floor colour; grout lines are 3 mm. The scale stays consistent across
  room shapes. Tile settings persist and support Undo, but are a visual preview,
  not a laying plan or tile quantity calculation.
- **Stacked wall cabinets**: select a wall/display cupboard, upper corner, open shelf or
  tall housing and use **Add cabinet above** in its properties.
  Each added cupboard is an independent unit with its own cut parts, dimensions
  and finishes. Its back anchor stays aligned, it keeps at least 30 mm below
  the ceiling, and the complete insertion is one Undo step.
  - The operation explains blocked space or insufficient height rather than
    inserting overlapping cabinets. Each tier's size and 2D placement remain
    editable and are checked as usual. Wall fixings, opening systems, load
    ratings and appliance ventilation still require an installer specification.
  - In **Layout**, **Upper cabinet row** makes overlapping rows individually
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
- **3D**: orbit around the kitchen; walls facing the camera cut away so you can
  look inside. Use **3D / Front / Top** for preset views. All rendered models
  use neutral, even lighting: the editor, finished-kitchen previews, generated
  gallery thumbnails and customer HTML have no cast shadows, directional
  lighting effects, LED strips or floor reflections. Old lighting settings
  do not turn these effects back on. Reference photos are not relit.
  - Choose front colours/woods, handle and worktop finishes (including
    textured marble and travertine), a backsplash or shelf accessories.
    Click or tap a unit to select it. Dragging its body turns the camera,
    even with **Resize** active. Only the dimension handles resize a cabinet;
    there are no 3D move handles for cabinets or room objects.
  - Style controls start closed to leave the room visible. Front and carcass
    finishes can also be chosen per unit, making two-tone kitchens possible.
    Appearance is not a substitute for specifying the actual purchased boards.
    Flat and Shaker-relief fronts are available; the relief is a visual preview,
    while the cutting list gives blanks rather than machining or joinery drawings.
    The 3D canvas renders on demand rather than continuously while idle.
- **Photo studio** (**Foto studio**) is a tab in **Ideas**, not a
  **Photo/Foto** shortcut in the 3D toolbar. Browse the curated **Warm
  contemporary**, **Oak and walnut** and **Japandi** Pinterest sources there.
  A source link opens the original site; it isn't a bundled image or a 3D
  model. Link-only sources are not downloaded or hotlinked.
  - Bundled photos have their own photographer, source and usage terms.
    Where there is a corresponding editable 3D interpretation, you can open
    it as a separate project and compare the photo with live 3D. Its dimensions
    are estimates, not measurements recovered from the photograph. A source
    without a model is not offered as an editable kitchen.
  - A photo you own or have permission to use can be attached to any kitchen,
    with an optional original-source or Pinterest link. JPEG, PNG and WebP files
    up to 15 MB are resized/re-encoded to a bounded browser-local image; the photo
    is included in project JSON files, not uploaded to a service or included
    in the customer HTML. Previously saved references still open in the studio.
    Switching projects, closing the photo panel or removing the reference cancels
    a pending photo change, so a late upload cannot alter another kitchen.
  - **Paired photographs:** [White Wooden Cupboards — Mark McCammon](https://www.pexels.com/photo/white-wooden-cupboards-2724749/)
    and [Modern Kitchen Interior with Warm Lighting — DOAN THANH BINH](https://www.pexels.com/photo/modern-kitchen-interior-with-warm-lighting-36887742/).
  - **Reference only:** [Kitchen and Dining Area — Mark McCammon](https://www.pexels.com/photo/kitchen-and-dining-area-1080721/),
    [Green Leafed Plants On Kitchen Island — Rene Terp](https://www.pexels.com/photo/green-leafed-plants-on-kitchen-island-1358900/),
    [Kitchen — Level 23 Media](https://www.pexels.com/photo/kitchen-3016430/) and
    [Brown and White Wooden Kitchen Island — Pixabay](https://www.pexels.com/photo/brown-and-white-wooden-kitchen-island-280232/).
    **Compare with my kitchen** changes only the reference in the current project.
    These four images are resized to 1024 px wide and encoded as WebP (174 KiB combined).
  - The six entries above each credit their source and link to its
    [Pexels License](https://www.pexels.com/license/). Check the terms for
    each source; a Pinterest link is not permission to reuse the image.
- **More kitchen parts**: 52 library choices, including ceiling cupboards, wide drawer units,
  pull-out baskets, pantry sizes, open shelves, glass display cabinets,
  oven towers, separate hob cabinets, integrated fridge housings, extractor
  hoods, island drawer units and breakfast bars. Island and bar presets try
  the room centre first; modules can be dragged, resized and rotated on the plan.
  - Glass doors use separate unbanded glass blanks and glass hinges, not MDF
    door panels. Breakfast bars have a real 38 mm top and purchased support legs.
    Required specialist stock is added to older projects when needed.
  - Oven/fridge housings have no back panel for ventilation; towers have
    two oven-support shelves. Appliances and pull-out systems appear in
    the hardware/shopping list. Confirm niches, loads, ventilation,
    fixings and glass specifications with the manufacturer before production.
  - Backsplash and decorative accessories are visual references,
    specified separately rather than silently counted as cabinet boards.
- **Units**: doors, drawers and shelves; full-overlay or inset fronts; hinge side;
  equal drawers or a shallow top drawer; a front-view preview; the unit's own
  parts list; a different board for any one unit.
- **Settings**:
  - *Materials and edges*: a library of boards (thickness, sheet size, grain,
    price) and edge bands; which ones the carcass, backs and fronts use; which
    edges are banded; optionally cut parts smaller by the band thickness.
    Boards start collapsed. Expand one row to edit it. Boards needed for
    actual cut pieces, including overrides and extra pieces, are marked and
    listed first. Board labels include their thickness. Sheet and edge-band
    prices are in RSD in either language. Leave an unknown price blank.
  - *Construction*: bottom/top joints, rails or full top, nailed or grooved
    backs, door type, front gaps, shelf setback, wooden or metal drawers.
- **Cut list**: every piece, identical pieces grouped, banded edges per
  piece; per board the area, sheets needed and cost; edge banding in metres;
  the hardware list (hinges, slides, handles, legs, shelf pins, hangers).
  Priced lines remain visible individually. A material total appears only when
  all required sheets and edging have prices and every cut piece fits its sheet.
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
  - *Totals and export*: the piece and sheet counts come first; the info button
    beside the sheet count explains the estimate. Export and Print stay in
    reach while the list scrolls. Export a PDF (plan, board totals, construction summary,
    parts, hardware, parts by unit), an Excel workbook (parts, by unit,
    materials, hardware, project), CSV, a copy for pasting into a
    spreadsheet, and print.
- **Projects**: several kitchens, each saved in the browser as you work; open,
  copy, delete, save one to a file and open it again (also on another
  device).
- **Languages**: choose Serbian (Latin script) or English in **Settings**
  (**⋯ → Settings** on phones). The language applies to
  part names, hardware, checks, the PDF, the Excel file and the CSV (with a
  decimal comma in Serbian). New unit codes follow the chosen language (in
  Serbian: D1 donji, G1 gornji, V1 visoki, …). Built-in boards are shown in
  that language until you rename them.
- **Checks**: overlapping units, units through the ceiling, gaps that need a
  filler, doors that will sag, drawers that cannot be built, wall units hung
  too low, parts larger than a sheet, units blocking a door or covering a
  window, a fridge next to the oven.
  In Layout or kitchen 3D on a phone, open **⋯ → Checks** (**Više → Provere**) to see the issue
  count and review problems. Elsewhere, use the checks badge.
  Select a problem to see its cabinet on the 2D plan, or its room object
  when no cabinet is involved. Supplier reminders stay separate.
- **Windows and doors** can be selected in 3D, including by their frames
  when the near wall cuts away automatically. To change their location, select **Edit
  position in 2D** and work in the wall elevation. Angled walls and either
  face of an interior partition are supported. These diagrams are not
  door-swing or glazing specifications.
- On phones, **View / Prikaz** opens camera controls in both 3D workspaces.
  In **Room → Room model**, it also toggles dimension labels; the complete
  measurement list stays below the scene. In kitchen **3D**, use **Style**,
  preview cabinets, or use the separate **Share** action. Drag to orbit
  without moving objects; tap the scene to bring its controls back. The navigation
  tip disappears on a drag or after six seconds. Use **?** in View to see it again.
- **Hide a wall in kitchen 3D:** open **View → Walls** (**Prikaz → Zidovi**) on
  a phone, or **Tools → Walls** on desktop. Uncheck any wall or partition to
  hide it, its finishes, windows and doors. Check it again or choose **Show all
  walls** to restore normal camera cutaways. This changes only your 3D view,
  not the room drawing, cabinets, cut list or customer export.
- **Desktop 3D toolbar**: the toolbar above the viewport holds **Style**, **3D /
  Front / Top**, **Open all** and **Share**. **Tools** includes the room
  object list and help. A selected door, window or structure shows its own
  actions. Hover or focus a toolbar button to read its hint, or hold it
  briefly on a touch screen.
- **Open a cabinet**: double-click it, or select it and press **Open**. Doors
  swing open and drawers slide out, lower drawers further than the ones above,
  so every drawer shows its inside. The camera glides to a three-quarter view
  of the cabinet (from above for floor units, from eye level for wall and tall
  units) and glides back when the last open cabinet is closed. **Open all** in
  the toolbar opens or closes every cabinet without moving the camera. Opening
  is a view-only preview: it does not change dimensions or cutting quantities.
  An open cabinet cannot be resized. Close its preview to use the resize
  handles again; cabinet placement is always edited in 2D.
  Animations are skipped when the system asks for reduced motion.
- **Inspect one cabinet on a phone**: select it in **3D**. Tap **Open** (**Otvori**)
  next to it to look behind the doors, or tap **Parts** (**Delovi**) in the bottom
  panel for its cut pieces, sizes, boards and fittings. Hardware such as shelf
  pins and wall hangers is listed even when it isn't drawn in the 3D preview.
- **See inside cabinets**: turn on **Interior view** in the toolbar (under
  **View** on phones) to hide
  fronts and reveal shelves, corner compartments and drawer boxes. Toggle it off
  to restore the finished kitchen. This schematic view does not change the
  project, Undo history or cutting list; appliance interiors and fitting details
  are not modelled. Turn off Interior view before resizing a cabinet.
- **Resize cabinets in 3D**: select a cabinet and press its **Resize** button.
  Draggable 3D arrows point outward from the appropriate faces for Width,
  Height and Depth (corner units also offer the second arm). Drag an arrow
  outward to grow that dimension or inward to shrink it; labels update live.
  The arrows follow the cabinet's rotation and have enlarged touch targets.
  Only a drag that starts on a dimension handle changes the size. A drag on
  the cabinet body or the background orbits the view, even in Resize mode;
  it never changes the cabinet's position. Press **Done** to exit.
  The back-left anchor and elevation stay fixed; size limits, the room outline
  and ceiling constrain the change. Grid snapping follows the plan setting.
  Use the 2D properties for exact measurements, **Undo** to restore a
  completed resize, or Escape to cancel an unfinished one. Mouse and touch work.
  Other cabinets are not moved; review collision warnings before cutting.
- **Irregular rooms**: rectangular, L-shaped/stepped and diagonal-corner
  footprints, editable polygon rooms with multiple diagonal walls, plus
  full-height chimneys, columns and wall projections.
  Structures reserve space but are not cabinet parts. Automatic placement
  avoids them; manual conflicts remain visible as explicit design-check errors.
  The plan, 3D view, PDF plan and saved project all use the same room geometry.
  Active chimney fire/heat clearances must be specified with a qualified installer;
  the room model is not a fire-safety calculation.
  - Position a chimney, column or wall projection **on the 2D plan**. Cabinets
    stay put when a structure moves; review conflicts in Checks. In 3D, select
    the structure to inspect it or return to the plan to change its position.
  - Room setup includes **L-shaped room + chimney** and **Diagonal corner + column**
    examples, each opened in a new project without replacing the current one.
  - Under **Walls & angles**, add or remove a corner to make a custom outline.
    In a polygon, editing a diagonal moves its end corner and adjoining edge;
    it isn't a constraint solver. Room width/depth bound the editing area;
    they do not stretch a custom polygon. Existing cabinet conflicts remain
    visible in Checks.
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
| `src/export/` | PDF (pdfmake) and Excel (exceljs) cutting lists, the plan drawing for the PDF, and the standalone 3D customer viewer. |
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
