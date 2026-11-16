# Build a Kitchen Designer App – Drag & Drop + Automatic Cutting List

Act as a senior full-stack engineer, product designer, and software architect.

I want you to build a simple, modern, extremely easy-to-use web application that allows anyone to design a custom kitchen using drag-and-drop elements and automatically generates all measurements and wood pieces needed to manufacture that kitchen.

The application should feel like a combination of IKEA Kitchen Planner and a very simple CAD tool, but much easier to use.

## 1. Core concept

The user should be able to:
1. Create a new kitchen project.
2. Define the dimensions of the room.
3. Drag and drop kitchen cabinets and elements onto a 2D canvas.
4. Resize and position every element.
5. Customize cabinet dimensions.
6. Automatically calculate all required measurements.
7. Generate a complete wood cutting list.
8. Export the result as a PDF or Excel file.

The main goal is simplicity. A person without technical or engineering knowledge should be able to design a kitchen.

## 2. Main interface

Create a clean, modern interface with three main areas:

**LEFT SIDEBAR – ELEMENT LIBRARY**

A collection of draggable kitchen elements:

The initial library shows eight most-used parts, with search and **Browse all
parts** exposing the full catalogue. In 3D it collapses to **Add element**.

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
- 2D top-down or front-elevation kitchen design.
- Drag and drop elements from the sidebar.
- Snap-to-grid functionality.
- Move elements freely.
- Resize elements.
- Rotate elements when applicable.
- Select and edit individual elements.
- Show dimensions directly on the canvas.
- Zoom in and out.
- Undo and redo.
- Support straight kitchens, L-shaped kitchens, and U-shaped kitchens.

The plan initially labels floor units only. Other rows are faint, noninteractive
outlines without labels, symbols or dimensions. Wall-unit mode defaults to one
upper height band and allows selecting another band. **View** groups snapping,
grid size and dimensions. One **Settings** dialog contains materials and
construction. Phones keep selected-cabinet actions only in the bottom sheet,
with touch controls at least 44 pixels high/wide.

Without a selection, room settings initially expose width, depth, ceiling height,
windows and doors. Structures, wall geometry and expert help are behind one
**Advanced room** disclosure. Gallery photographs precede explanatory content,
with collection, layout and room-size filters grouped in one desktop row.

The interface defaults to Serbian for a Serbian primary browser language,
English otherwise; an explicitly saved language overrides detection.

All dimensions should be displayed in millimeters.

### Premium studio and advanced room editing

- The desktop and phone editor use a consistent warm-neutral studio interface.
  The image-led gallery contains 52 editable kitchens, including 18 original
  warm contemporary, dark luxury and Japandi compositions inspired by public
  Pinterest collections. Preview images are rendered from the actual preset
  model; Pinterest photographs are not copied or rehosted.
- Ten reference-inspired framed kitchens use hand-composed
  cabinetry rather than generic starter runs. A continuous 600 mm deep
  ceiling row and editable timber return panels surround recessed 320 mm
  uppers. The examples include contrasting wood/stone backsplashes, black
  appliances and an optional timber island. Their gallery images and initial
  editor camera both use the front view. Dimensions are approximate design
  choices; reference photographs are not embedded or claimed as measured plans.
  Sage, terracotta and noir palettes complement walnut and ash island variants.
  One composition reserves a full-height chimney bay beside all cabinet tiers;
  structures are labelled and searchable in both languages. Chimney geometry
  does not specify safe fire/heat clearances.
- Gallery search combines translated names, finishes, styles and feature
  labels, ignoring case and diacritics. Collection, layout and optional room
  dimension filters combine; size checks include ceiling height and compare
  width/depth without rotation. They do not promise polygon containment or
  adapt a preset to the current room. Empty results explain recovery, and a
  single reset clears all filters without changing the saved design.
- Rooms support a closed, clockwise polygon with stable wall identities.
  Individual wall lengths/angles and shared corners are editable. A wall edit
  moves its end corner and the adjoining edge; it is not a constraint solver.
  Self-crossing/degenerate geometry must not be committed. Existing rectangle,
  notched and single-diagonal room projects remain readable.
- Cabinets may rotate to arbitrary angles and align/snap to real wall segments.
  Plan, 3D, collision checks, openings and exported plans use the same local
  transforms and polygon geometry. Cabinet construction remains rectangular
  or a right-angled L; custom mitred fabrication is outside this model.
- Doors, windows, chimneys, columns and wall projections can be selected in 3D
  by clicking their geometry or using the room-object selector. Translation
  handles keep openings on their existing wall (including angled/partition
  faces); windows can move vertically, while doors remain at floor level.
  Structure handles move only the selected structure in X/Z and reject positions
  outside the actual room polygon. Measurements and wall attachments remain
  editable in a focused dialog. Drags support grid snapping, single-step Undo,
  cancellation and touch, without repositioning cabinetry or resetting the
  camera. Opening frames remain selectable when a nearby wall is hidden.
- Selected cabinets have separate Move and Resize modes. Resize offers labelled
  dimension selectors with live millimetre values and one local-axis handle,
  including the second arm of corner cabinets. Drags preserve the back-left
  anchor and elevation, respect catalog/grid limits, reject room-outline
  excursions and cap height at the ceiling. Each mouse/touch drag is one Undo
  step; interruption or Escape rolls back. Exact numeric editing remains available.
- The 3D controls live in a docked, initially collapsed Tools panel outside the
  viewport, including selection warnings. Instructions expand separately within
  that panel. Selecting a cabinet does not open it; collapsing it cancels active
  manipulation and leaves the kitchen unobstructed.
- Cabinet bodies support direct mouse/touch hold-drag movement with a small
  movement threshold to distinguish selection from dragging. Selection exposes
  local width, height and depth resize arrows while the Tools panel is closed
  (the blue arrow adjusts the second arm on corner units). Direct movement
  preserves elevation, reuses plan placement/snapping and records one Undo step.
  Pointer interruption, Escape or project changes cannot commit a partial move.
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
- Project format version 5 retains old project import support and persists
  polygon walls, arbitrary cabinet angles, partitions and visual treatments.

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

All properties should update the design immediately.

The cutting-list screen leads with material totals and export; the plan and
cabinet drawings sit in a collapsed overview below the list. Supplier/appliance,
glass, front-profile, handleless-system and chimney-clearance confirmations are
neutral pre-cutting reminders, not problem badges or canvas warning outlines.
Collisions and actionable design/manufacturing warnings remain visible problems.

The docked 3D tools include a view-only **Interior view** toggle, off by default.
It hides cabinet fronts and replaces solid bodies with panel carcasses, configured
shelves, hollow corner compartments and schematic drawer boxes. Appliances remain
closed; their internal mechanisms and supplier fittings are not modelled.
Changing this view never changes project data, Undo history or cutting quantities.
Selecting a cabinet also shows a 44px hand-shaped move handle. Hold and drag it
to move the unit with existing snapping and Undo, independently of resize arrows.
Double-clicking a cabinet or pressing its adjacent door icon animates its fronts
open/closed, including sliding drawer boxes. Animation invalidates only until
settled and never changes project data or cutting quantities.
Cabinet dragging applies 60% of pointer travel before snapping. Clicking the
hand opens precise room-plan directional controls below the desktop viewport
or in the phone's selected-element bottom menu, with 10/50/100 mm steps.
Opening a cabinet also requests the existing selected-cabinet camera focus;
closing it retains the focused view.

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

Whenever a cabinet is added or modified, automatically regenerate its components.

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

The interface should be extremely simple.

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

## 8. Development approach

Do not attempt to build everything in one giant component.

Build the application in logical phases:

Phase 1:
- Main interface.
- Kitchen canvas.
- Drag-and-drop cabinet library.
- Add, move, resize, and delete cabinets.
- Room dimensions.

Phase 2:
- Cabinet construction logic.
- Automatic panel calculations.
- Editable cabinet properties.
- Cutting list generation.

Phase 3:
- Door and drawer configurations.
- Material management.
- Edge banding.
- Validation.

Phase 4:
- PDF and Excel exports.
- Project saving and loading.
- Polish and usability improvements.

Start by implementing Phase 1 and make it fully functional.

After completing each phase, test the functionality before moving forward.

Do not create fake buttons or placeholder functionality. Every visible control should work.

Do not overcomplicate the application. Prioritize simplicity, correctness, and usability.
