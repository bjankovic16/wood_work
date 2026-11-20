# Kitchen Designer – Product Specification

## 1. Core concept

Start with the user's measured room, not an example kitchen. The floor plan,
inside wall elevations and interactive 3D view are three views of **one
project in millimetres**. Move objects only on the 2D plan or inside wall
elevation. In 3D the user can inspect, orbit, change appearance, preview
fronts and resize a cabinet using dimension handles, but cannot reposition
objects. Users can also fit an idea to an empty room or try a different look
on existing furniture. Reopening a project must never replace it with a preset.

There are three distinct outputs: an editable project file, a workshop cutting
list (calculated from the construction settings), and a view-only 3D HTML
file for a customer. The customer does not need the editor or the cutting list.

Project import is atomic: validate supported versions, catalogue kinds, unique
identities and complete records before changing the active kitchen or history.
Keep supported legacy migrations and structurally valid drafts with design
warnings. Never silently discard unreadable objects or replace unreadable saved
data under its original identity; surface recovery guidance and preserve backups.

## 2. Main interface

### Room: first screen, walls and openings

- On a first visit and for a new project, open **Room** (**Prostorija**)
  on the 2D plan. Show room measurements before suggesting kitchen ideas. On
  return, resume the saved project. **Room** is a peer of kitchen **3D**
  on desktop and phone; selecting it always lands on the editable 2D floor
  plan. Both workspaces use the same project, without copying data or adding
  an undo step on navigation.
  **Start fresh** inside **Projects**
  saves the current kitchen and opens a separate empty project at the first
  measurement step. It does not erase projects or reset preferences. Offer
  five seconds to Undo Start fresh, deleting a cabinet, or trying another
  style. Bind the action to the original change; never undo a later edit.
  Undo Start fresh returns to the previous project without deleting either.
- From any workspace, a compact planning guide identifies the current step and
  links to room measurements, the kitchen plan, furnished 3D and the cutting list.
  The guide and Projects offer read-only A/B comparison of the active design
  with another saved kitchen at the same scale. Use actual floor area and
  cutting-list quantities. Explicitly choosing **Edit a copy** opens a separate
  numbered variant; preserve the original, including just-committed edits.
- Use the same numbered destinations and names in the guide, on laptops and in
  the four equal phone tabs: **1 Room → 2 Layout → 3 3D → 4 Cut list**. Keep
  the phone project header stable. In Layout, let the drawing and cabinet sheet
  meet the bottom tabs. In Layout and furnished 3D, open checks from **⋯**
  and continue via the next numbered tab. Only Room shows a next-step row; Cut list offers the real
  Export menu. Put language selection in Settings.
- An empty Layout offers two large actions: preview **Ideas** in the measured room,
  or add cabinets manually using the existing library. Browsing and reordering
  ideas do not change the kitchen. Keep applying a style distinct from reordering.
- In Room, **Room model** switches between geometry editing and a
  separate architectural scene. Share Layout's drawing palette, wall weight
  and scale-aware floor grid while preserving user-selected finishes. Offer **3D
  preview** as a lightweight room-shaped cube on the canvas: a resizable inset
  on desktop without shrinking the drawing, and an in-place view on phones.
  The inset can expand to the full room model. Do not mount a WebGL scene for
  the collapsed cube. Closing or choosing **2D** returns to the originating
  outline or elevation. Omit kitchen meshes and automatic backsplashes, but retain manual
  wall finishes. Project dimension labels only on request, in either layout. Keep a complete,
  scrollable list (collapsible on phones) of room size/area, wall lengths/heights/angles, partition
  dimensions and positions, and opening, structure and finish dimensions and
  placements. Report actual polygon edges and wall-start-relative offsets.
  Plan, elevation, room 3D and inspector
  share the selected wall, opening or structure; switching views neither
  duplicates project data nor clears that selection. **Edit position in 2D**
  returns from 3D to the plan or wall elevation with the selected object.
- Number the clockwise perimeter segments **Wall 1**, **Wall 2**, etc.,
  continuing past four for a notched or polygonal room. Numbers are labels
  for the user, not attachment IDs. Mark the start of the selected wall.
  Clicking or tapping its dimension opens numeric input. The dimension must
  also be keyboard-focusable and activatable, with equivalent panel fields.
  Label quantities **Wall length**, **Height to ceiling** and **From wall
  start** rather than showing direction arrows without an origin.
- Typing a wall length in a rectangle keeps it rectangular. On the 2D floor
  plan, dragging a perimeter corner instead moves only that vertex, allowing
  angled walls without changing views. Update the two adjacent wall lengths
  and area live. Mark the inside angle at the active corner, including reflex
  angles; changing the measurements must not reflow the phone caption or resize
  the drawing under the pointer. Touch, mouse and
  keyboard users can move a corner. A completed drag is one undo step; a tap
  or cancelled gesture is not an edit. Stop at the last valid position if the
  outline would cross or a cabinet, fixture or opening would no longer fit;
  do not move or shrink it to make it fit. Keep stable wall IDs and account
  for legacy bottom/left opening offsets.
- Selecting a perimeter wall line keeps the outline open. Drag the line or its
  visible two-way grip to translate both endpoints perpendicular to that wall;
  keep it parallel and connected to its neighbours. Share corner-edit validation,
  gesture history and physical-frame rebasing. Openings follow with unchanged
  wall-start offsets; cabinets and fixed fixtures are not relocated to make a
  move work. Offer keyboard steps of 10 mm or 100 mm with Shift.
- Snap a dragged corner's interior angle to exactly 90° or 270° within 5°.
  Wall angle fields normalize near quarter-turn directions using the same
  tolerance and provide 0°, 90°, 180° and 270° presets. A visible, remembered
  toggle disables angle snapping; Alt bypasses it during a mouse corner drag.
  Snapping never bypasses room or attachment validation.
- Tapping a wall's **Wall view** shortcut opens its **2D inside
  elevation**. Keep the shortcut distinct from the numeric measurement and
  corner drag targets. Offer the same shortcut at the wall labels and in
  the measurement list in room 3D, including both partition faces. Tapping the
  actual room 3D wall opens its inside elevation without enabling labels. Provide a drawing
  dropdown for the plan and all wall faces, a mini-plan marking the current face,
  and a one-tap return. Show which wall adjoins each end of the inside elevation
  and allow direct navigation to it. Use the actual face direction, including
  on partitions; label a free end without offering a link. Show the green origin, length and height rulers, real
  openings and optional read-only cabinet outlines (off by default). Use one **Add** dropdown shared by
  the plan and elevation, grouping openings separately from fixed structures.
  The object picker revisits existing objects without creating another one.
  Drag an opening along the wall or enter its width, height and
  distance from the marked start. A window also has a sill height above the
  floor; a door always starts at floor level. In this elevation, use architectural
  dimension lines with witness lines and ticks, not floating object cards.
  Dimension the selected opening's offset and width below the wall, and height
  and nonzero sill to the right. Keep the digits outside the openings, live
  during a drag, and keep the numeric fields in the inspector. Support angled
  segments and either face of an interior partition.
- A chimney can sit **against a wall**: enter its length along the wall, its
  projection into the room and offset from the wall start. Free placement on
  the plan is also possible. For an angled wall calculate contact on the real
  segment and check the footprint against the actual polygon, not its bounding
  box. Provide separate, directly draggable plan grips for length and projection;
  keep the opposite edge fixed and allow exact sizes to expand back from a wall end.
  Room 3D provides explicit size fields for the selected structure or opening; body
  drags still orbit and position edits remain in 2D. In the 2D plan, arrow keys move a selected structure 10 mm;
  Shift + arrow moves it 100 mm. Give the controls a short hint and provide
  touch and numeric alternatives.
- Select each new object immediately. Put its card **directly below the room
  measurements** in the right inspector or the same section on a phone. Show
  dimensions and clearances at the selected object in both 2D and 3D.
  Position fields are edited in Room's 2D view. Fixed structures
  reserve space but are not cabinet parts; chimney geometry is not a fire/heat
  clearance calculation.

### Cabinet editor

After room setup the editor has three main areas:

**LEFT SIDEBAR – ELEMENT LIBRARY**

Drag elements from the library onto the **2D plan**. The initial library
shows eight most-used parts, with search and **Browse all parts** exposing
the full catalogue. Show real rendered pictures of all presets, including
width and ceiling variants. Keep browsing and direct adding independent of
WebGL. **Preview before adding** opens one isolated, rotatable model in the
project's own finishes; dismissing it must not change the design, selection
or Undo history. Confirming uses the ordinary placement command exactly once.
Corner cabinet insertion and snapping must consider the usable junction on
either side of a wall chimney. Validate the L-shaped footprint, including
opening clearances and neighbours at the same height, before insertion.

Base cabinets:
- 300mm cabinet
- 400mm cabinet
- 450mm cabinet
- 500mm cabinet
- 600mm cabinet
- 800mm cabinet
- 900mm cabinet
- Custom cabinet

Wall cabinets:
- 300mm cabinet
- 400mm cabinet
- 500mm cabinet
- 600mm cabinet
- 800mm cabinet
- Custom cabinet

Other elements:
- Sink cabinet
- Oven cabinet
- Dishwasher space
- Refrigerator space
- Drawer cabinet
- Corner cabinet
- Tall pantry cabinet
- Open shelves
- Filler panels
- End panels

**CENTER – DESIGN CANVAS**

This is the main working area.

Requirements:
- 2D top-down cabinet placement in the measured room.
- Drag and drop elements from the sidebar.
- Snap-to-grid functionality.
- Move elements on the 2D plan, by mouse, touch or keyboard.
- Resize elements.
- Rotate elements when applicable. Keep the 90° icon visible beside desktop
  selection actions and in the phone element-sheet header at every sheet size
  and tab; do not bury it under position fields. Retain 2D-only placement editing.
- Select and edit individual elements.
- Show dimensions directly on the canvas.
- Zoom in and out.
- Undo and redo.
- Support straight kitchens, L-shaped kitchens, and U-shaped kitchens.

The plan opens on **All**. Show upper footprints as faint dashed outlines without
their codes or dimensions; a stacked floor cabinet owns the shared hit area.
Identify a cabinet by its full localized name on desktop hover or in the phone
sheet after a tap. Do not repeat its name or the dimmed-layer hint over the
phone drawing. Use **Wall units**
and the upper-row selector to label, measure and edit a specific upper tier.
On phones fit to the usable drawing area, show total
and selected dimensions by default, allow all dimensions on demand, and use
pinch and a single **Fit** button. Keep the selected cabinet above its sheet. During a
drag, isolate its layer and restore the user's filter on release or cancellation.
Filtered rows are faint, noninteractive outlines. Wall-unit mode defaults to one
upper height band and allows selecting another band. **View** groups snapping,
grid size and dimensions. One **Settings** dialog contains materials and
construction. On phones keep the selected cabinet's plan controls in a bottom
sheet with small, half and full detents. The grip has no visible height caption;
its accessible value and help, tap, drag and keyboard controls remain available.
Both editor widths use Size, Fronts, Materials and Parts tabs and common-size
picks. Put stacking after the everyday size, position and code fields.
On phones, Add allows repeated picks or **Edit on plan**, **Resize** and **Move**
for the last pick. Edit on plan exposes the selected cabinet (and its upper row if
needed) without opening a form. Drag its body to move it or a side/front edge to
resize it. Provide separate, connected grips on narrow footprints; grabbing a
grip off-centre must not jump the measurement. Resize opens the exact width field.
In Layout, Move lets a user tap a free destination
for the selected footprint's centre without rotation or wall snapping. Check
the actual room and obstacles before placing; a rejected tap, a pinch or Cancel
does not edit the design. Normal body drags, edge resizing and 3D orbit still work independently.

- Interior partitions have independent endpoints, thickness and height.
  Both faces are usable; collisions take the cabinet's vertical range into
  account. Wall panels and backsplash runs have a wall attachment, finish,
  span, elevation and height, and are clipped around openings.
- Partitions and decorative finishes are visual room specifications, not
  cabinet cutting quantities, structural certification or installer drawings.
- A guided three-tier operation places two editable upper rows above a suitable
  base run. It previews both heights/depths, retains 450 mm minimum worktop
  clearance and a 30 mm ceiling gap, and inserts all cupboards in one undo step
  only if the entire proposal fits. Existing cabinets are not replaced.
- Elevation-based row selection remains independent of that shortcut: manually
  arranged designs may have more upper rows, and full-height displays stay
  visible across every row they span.
- Cabinets may rotate to arbitrary angles and snap to real wall segments.
  Plan, elevations, 3D, collision checks, openings, saved projects and exported
  plans use the same geometry. Cabinet construction remains rectangular or a
  right-angled L; custom mitres require separate fabrication drawings.

**RIGHT SIDEBAR – PROPERTIES**

When selecting a cabinet, show:
- Width
- Height
- Depth
- Number of doors
- Number of drawers
- Number of shelves
- Material thickness
- Back panel thickness
- Door type
- Edge banding configuration

Show the effect of valid property edits when the user commits a value. Keep
placement fields in 2D, including when the selection came from the 3D view.
With no cabinet selected, show a read-only room summary and a path to Room
design rather than a second set of wall and opening editors.

Board settings expand one row at a time; mark boards used by actual cut pieces
and list those first. Include the board's thickness in its display label in
pickers, checks and workshop outputs, without changing its editable name or ID.
Show currency for priced stock; leave unknown prices blank. A total requires
prices for every used board and edge band and a sheet estimate that fits all pieces.
The cutting-list screen leads with piece and sheet counts and material totals;
an info button explains the sheet estimate. Keep Export and Print accessible
while the list scrolls. The plan and cabinet drawings sit in a collapsed overview
below the list. Supplier/appliance,
glass, front-profile, handleless-system and chimney-clearance confirmations are
neutral pre-cutting reminders, not problem badges or canvas warning outlines.
Collisions and actionable design/manufacturing warnings remain visible problems.
Validate effective cut sizes, stock and L-shaped cutouts after manual edits and
edge subtraction. Keep impossible pieces visible for correction, but do not nest
them or present complete material estimates. Block manufacturing PDF, Excel, CSV,
clipboard and print output for these pieces; leave editing, JSON backups and
customer views available. Quantity zero suppresses a piece without blocking export.
Count/material-only edits must not change its finished edging; L-shaped size edits
retain arm depths and update cutout notes and area consistently.
End-panel footprint width is derived from its actual cut-stock thickness, not an
independently editable dimension. Preserve its back anchor through material edits.
Custom-room overall width/depth are read-only outline bounds; wall/corner editing
changes the outline, while ceiling height remains editable. Explain rejected
numeric edits with localized, associated input feedback.
Hover, focus or tap Checks to preview at most two of these (errors first).
Selecting a cabinet issue reveals that cabinet on the 2D plan at either width.

### Ideas: fitting a room versus changing a look

**Continue to kitchen** goes directly to the plan, even when it is still empty.
Remember measured projects separately from new ones. Provide a single **Ideas**
entry in the desktop top bar and the phone More menu before the cutting step. Cards open review;
opening the original as a separate project is a secondary menu action. Start
with the original room-size filter on. The decision depends on the number of
**kitchen elements**, not the presence of room objects:

1. **Empty of kitchen elements:** derive a proposal from the idea's runs,
   characteristic cabinets and upper rows. Use the user's real wall segments
   and the space available at each cabinet's elevation; account for door and
   window openings, sill heights, chimneys, partitions, diagonals and island
   passage. Reserve at least 900 mm on all four sides of a proposed island.
   Use allowed cabinet widths and fillers, not scaled-down appliances or
   coordinates copied from the original kitchen.
   - For an L, preview the main wall and **left or right return** before applying
     it. Facing the main wall from inside, the left return joins its marked
     start and the right return its end. Use the chosen main segment and its
     adjacent return; do not silently switch walls or mirror the room, its
     openings or its obstacles.
   - If the fit needs adjustments, identify resized, added or omitted elements.
     Validate the exact candidate with **Checks**, including board sizes and
     manual pieces. List every remaining issue before acceptance and show the
     adjustment count with an Undo action afterwards. If no valid arrangement fits, explain
     the blocking constraint. Do not insert overlapping units, partially apply
     a rejected proposal or substitute the example room.
2. **At least one kitchen element:** review and transfer only the visual finishes;
   **Apply a style to my kitchen** in Ideas can cycle these directly. Preserve
   every item's identity, kind, position, dimensions, rotation and elevation.
   Do not add a missing upper row or island, reorient an existing L, remove
   furniture or recalculate its layout.

Both paths retain the project name, room geometry, openings, structures and
fabrication rules. A fitted layout generates parts for the **new** cabinets.
Changing only the appearance must leave the **existing** cutting list unchanged.

Apply the look by role: base cabinets, towers, upper rows, island and visible
side panels. Both **Apply this look** and **Apply a style to my kitchen** set fronts, profile,
carcasses, handles, worktop and visible room joinery (window frames, door frames
and door leaves). Update existing per-unit finishes as well as common defaults;
do not flatten a two-tone design into one finish or leave the old per-unit
colour on top. Plinths follow cabinet fronts; preserve wall paint, floor finishes
and existing cladding. Finishes remain manually editable. They are distinct from
the purchased boards, thicknesses, edge bands, manual part edits and extra pieces.

**Open original in a separate project** opens the exact example, including
its prepared room, as a new project. Keep the user's current project saved.
Generate gallery thumbnails from these originals, not from a fit to whichever
room happens to be open. The 61 designs include
the Warm contemporary, Dark luxury and Japandi collections, framed kitchens
and stacked uppers. Search translated names, finishes, styles and features
without requiring accents. The optional gallery size filter compares original
width, depth and ceiling height. Passing a filter is not a fit check.
Show the actual finished Studio models on kitchen cards without loading a
WebGL context per card. A fit review can orbit the exact candidate in the
user's room; retain its 2D wall picker, including without WebGL. Searching,
previewing, shuffling the gallery order and resetting filters must not edit a project.

### Editing and previewing in 3D

- Keep the project and navigation bars in the same position in both phone 3D
  views. The scene's **View / Prikaz** opens a bottom sheet for camera presets/reset
  and help. Room review offers dimension labels, not cabinet actions. In
  kitchen 3D the sheet adds **Style** and cabinet previews. **Share** is
  a separate main action. Keep the workspace tabs distinct from camera choices.
  Opening the sheet does not reframe the camera or edit the project. Real orbit
  drags hide scene controls, not navigation; a tap restores the controls without moving or selecting anything.
  The first tip disappears on drag or after six seconds, and stays dismissed
  across visits unless explicitly requested via **?**.
- In the desktop editor, dock **Perspective / Studio / Front / Top**, **Style**, cabinet previews and **Share**
  above the viewport. **Tools** includes room objects, wall visibility and help.
  In kitchen 3D, use **View → Walls** on phone or **Tools → Walls** on desktop
  to hide individual perimeter segments and whole partitions. Hide their
  openings and surface finishes, not cabinets. Restoring a wall resumes normal
  camera cutaways. These choices survive switching tabs, but do not change
  the room model, project, undo history, cut list or customer export, and reset
  on switching projects or reloading.
  Click or tap a cabinet, wall, opening or structure to select it. Mouse
  drags and touch swipes on the background **or an object's body** orbit the
  camera; scroll or pinch to zoom. This holds even when the object is already
  selected or **Resize** is active. There is no 3D translation mode, move
  handle, nudge shortcut or numeric position control that moves an object.
- In the furnished kitchen, **Perspective** shows detailed surfaces and fittings
  on first entry, for new and existing projects on desktop and phone. **Studio**
  uses the same model from an elevated three-quarter angle with a charcoal
  background; **Front** and **Top** are simpler inspection views. The architectural
  Room model remains separate. Share a detailed Perspective or Studio presentation,
  including its poster and interactive offline model.
  Keep the material response fixed in room space, scale timber grain to the
  board and continue patterned stone across worktop joins. Use the actual
  board recesses and furniture footprints for local ambient occlusion, including
  the gaps between floating shelves. Carry the surface detail in the offline
  viewer. Do not edit the design or add lamps, scene reflections or cast shadows.
  **Basil & graphite** opens in Studio. Its oak floating shelves have board cuts
  but no cabinet sides, back or shelf pins; wall fixings are specified separately.
- **Resize** is the exception for **dimensions**, not position: only a drag
  starting on a selected cabinet's dedicated width, height, depth or corner-arm
  handle changes its size. Show live measurements, keep its back anchor and
  elevation, and respect cabinet limits, ceiling and room outline. A body
  drag must neither resize nor translate the cabinet.
- Display room-object measurements at the 3D selection; keep opening frames
  selectable when a nearby wall is cut away. For a change of position, hand
  off to **2D**: place cabinets and structures on the plan or adjust an
  opening along its wall and a window's sill in the wall elevation. A
  camera gesture over a chimney, window or door cannot move it.
- **Open/Close** previews an individual cabinet (double-click also works);
  doors swing and drawers extend in a cascade. The camera frames the open
  cabinet and returns after the last closes. **Open all** previews the whole
  kitchen. **Interior view** hides fronts to reveal carcasses, shelves and
  drawer boxes, not the internals of appliances. Lock resizing of open
  cabinets and during Interior view. These preview controls do not
  change the project, Undo history or cutting list. Respect reduced motion.
- On a phone, label **Open/Close** on the selected cabinet. Provide **Parts**
  directly from its collapsed 3D sheet. List that unit's cut quantities, sizes,
  materials and hardware from the same rules as the workshop report, including
  applicable hand edits to cut parts. Inspecting the list must not edit the project.
- **Undo** (**Korak unazad**) is visible in the room and kitchen editors and
  uses one shared design history. A 2D move, 3D handle resize, committed
  measurement or applied idea that changes the design is **one** step.
  Release uses the final pointer position; Escape or interrupted touch
  cancels the gesture. Cancellation, orbiting
  and a gesture with no change do not add history.
- During a **2D plan** drag, update the position, snapping and relevant obstacle
  feedback as the pointer moves. Coalesce frequent input to at most one update
  per animation frame; do full design checks and persistence at commit, not
  on every pointer event. Keep 3D rendering on demand when idle.
- Use **neutral, even lighting** throughout the editor, finished-kitchen view,
  rendered model thumbnails and customer viewer. Preserve material and glass
  legibility without cast shadows, directional effects, LED strips or floor
  reflections. Do not offer controls for these effects or restore them from
  an older project. Do not retouch original reference photographs.

### Photo studio

Keep the **Photo studio** (**Foto studio**) tab in Ideas, but no
**Photo/Foto shortcut in 3D**, including under Tools. Distinguish:

- **Reference photograph:** a bundled image with its own author credit,
  original source and terms allowing that use. A reference-only photo can
  be compared with the current kitchen without changing the model. Terms
  for one photograph are not a licence for other images.
- **Curated source link:** include the warm contemporary, dark oak and
  walnut, and Japandi Pinterest collections as inspiration. If permission to
  bundle a photograph is not established, link to the original page; do not
  download or hotlink the image. A source link does not imply a corresponding model.
- **3D interpretation:** offer an original photo with its own editable model
  only where a model exists. Open that interpretation in a separate project;
  its layout and dimensions are estimates, not an automatic conversion from a
  photograph.

Users can still attach their own permitted images locally and compare them
with their kitchen. Preserve saved references on reopen and in editable
project files; omit them from the customer presentation.

### Customer presentation

The furnished kitchen's **3D → Share** presents one self-contained HTML file
to the native share sheet when supported, otherwise offers to save it. The customer opens the file locally, drags to
orbit, scrolls or pinches to zoom, and can reset the initial view. No install,
account or hosted project is required. The file must make no external network
requests, including to a CDN. This is a presentation of the finished kitchen,
not a CAD or manufacturing export.

- Embed the finished room and closed cabinets, materials and textures as
  binary glTF (GLB, **1000 mm = 1 m**), together with a locally bundled
  Three.js viewer. Include every physical wall and element, even those hidden by
  the editor camera or a layer filter. Cut away near walls as the viewer
  orbits so it can look inside; use a starting view of the whole kitchen.
- Generate from project geometry, not editing overlays or development hooks;
  load the exporter on demand. Escape the project name in the page title and
  use a safe filename. Exclude selection, manipulation handles, measurements,
  uploaded reference photos, prices, cutting lists and the internal project
  JSON. No separate `.glb` file should be needed.
- Embed a static image of the kitchen and an explanation for browsers without
  working interactive 3D. Neither the model nor the fallback needs the editor
  or a server to display.

## 3. Automatic cabinet calculations

This is the most important functionality.

Every cabinet must be represented by its actual construction components.

For example, a simple 600mm wide base cabinet might consist of:

- 2 side panels
- 1 bottom panel
- 1 top support or rail configuration
- 1 back panel
- 1 or more shelves
- 2 doors, if configured

Assume a default material thickness of 18mm, but allow the user to change it.

The application must automatically calculate the exact dimensions of every individual wood piece.

Example:

Cabinet external dimensions:
- Width: 600mm
- Height: 720mm
- Depth: 560mm
- Material thickness: 18mm

Example cutting calculations:
- Left side: 720 × 560mm
- Right side: 720 × 560mm
- Bottom: 564 × 560mm
- Back: calculated according to the selected construction method.

Important: These are illustrative calculations. Implement proper construction rules, including panel positioning, overlaps, clearances, and material thickness. Never use arbitrary dimensions.

Make cabinet construction configurable, because different manufacturers use different assembly methods.

## 4. Automatic cutting list

Create a dedicated section called "Cutting List".

The page includes the current kitchen plan and a selectable cabinet front-view
diagram derived from the same configuration as its generated fronts. Per-unit
groups pair these diagrams with cut tables and overall width/height/depth.
Manual panel edits do not change the cabinet diagram. Extra pieces appear in
both groupings, and warnings remain available for review before cutting.

Derive cabinet components from their geometry and construction rules. A
change of visual finish alone must not alter cut quantities or sizes, or
invalidate manual part edits.

The cutting list should contain:

| Piece | Quantity | Length | Width | Thickness | Material |
|---|---:|---:|---:|---:|---|
| Side panel | 2 | 720 | 560 | 18 | MDF |
| Bottom panel | 1 | 564 | 560 | 18 | MDF |
| Shelf | 1 | 564 | 540 | 18 | MDF |
| Door | 2 | Calculated | Calculated | 18 | MDF |

Group identical pieces together to reduce waste.

Allow users to:
- Edit individual measurements.
- Change materials.
- Add custom pieces.
- View total material requirements.
- Export CSV and Excel.
- Generate a professional PDF cutting list.

## 5. Additional important functionality

Implement:
- Project saving and loading.
- Multiple kitchen projects.
- Automatic dimension validation.
- Warnings for overlapping cabinets.
- Wall dimension constraints.
- Material thickness configuration.
- Adjustable gaps between doors and drawers.
- Adjustable edge banding.
- Adjustable cabinet construction rules.

## 6. Design and UX

Use Serbian (Latin script) for a Serbian primary browser language and English
otherwise; remember the user's explicit choice. Keep room measurements,
object editing, idea previews and customer export usable on desktop and
phone in both languages.

Design inspiration:
- Linear
- Figma
- IKEA Kitchen Planner

Visual direction:
- Minimalist interface.
- White and light gray background.
- Subtle borders.
- Clean typography.
- Large design canvas.
- Clear icons.
- No unnecessary menus.
- Professional desktop-first experience.

The user should understand how to use the application without reading documentation.

## 7. Technical implementation

Choose a modern, maintainable architecture.

Preferred stack:
- React
- TypeScript
- Vite
- Tailwind CSS
- Zustand for state management
- React Konva or another suitable canvas library for drag-and-drop design
- IndexedDB or local storage for saving projects initially.

Keep the calculation engine independent from the UI.

Create reusable components and a well-structured codebase.

Most importantly, all measurements and cutting calculations must be handled by deterministic TypeScript functions, NOT by AI or LLM-generated calculations.

## 8. Acceptance checks

Run `npm test` for geometry, placement and cutting-list rules. Use the
following scenarios for the complete flow; check desktop and phone layouts
and both interface languages. See the [README](../README.md#running-it) for
the browser suites and prerequisites.

1. **Measure and reopen:** start a project, edit Wall 2 on the drawing, add
   a window in its elevation and place a chimney. Move the selection in 2D
   by mouse, touch and keyboard; compare the card, plan and 3D measurements.
   Try a diagonal and an invalid outline, then save and reopen. Check a legacy
   project with bottom/left wall openings. Room browser suites:
   `npm run e2e:room-workspace` and `npm run e2e:rooms`.
2. **Fit versus style:** in a room with obstacles but no cabinets, preview and
   try both returns of an L on the same main wall. Check fit adjustments and
   a refusal where no valid proposal exists. In a furnished room, compare
   IDs, geometry, manual part edits and cutting-list output before and after
   applying an idea. Check the visible cabinet and joinery finishes; restore
   them with one Undo. `npm run e2e:ideas` exercises both returns and the
   furnished-room path. Verify original gallery models separately from fits.
3. **2D move, 3D camera and Undo:** repeat the same mouse and touch placement
   on the `chimney-frame` **plan**, including release, cancellation and
   re-selection. Use `npm run profile:move` to compare frame times and update
   counts on the same device. Full checks and saves should be deferred during
   placement; a completed change should add one history entry. In full 3D,
   drag across selected and unselected cabinets and room objects, including
   in cabinet Resize mode. Verify the camera changes, but positions, sizes and
   history do not. Then drag a dimension handle: only that dimension changes;
   one Undo restores it. Check that 3D stops rendering at rest. Use
   `npm run e2e:resize` for cabinet handle and camera-gesture regressions.
4. **Studio and lighting:** compare a credited reference and an uploaded one
   from Photo studio, revisit a saved reference and follow a link-only source.
   Check for neutral lighting in the editor, original-model thumbnails and
   finished preview, including on loading old lighting settings. Do not expect
   a Photo shortcut in 3D or a model for every source.
5. **Customer file:** `npm run e2e:customer` opens the actual downloaded HTML
   as a local file in a clean browser context with the network disabled.
   Check orbit, zoom, reset, material textures, physical scale, walls behind
   the editor camera, and absence of editor/project data and reference photos.
   Disable WebGL to check the static image and explanation.
