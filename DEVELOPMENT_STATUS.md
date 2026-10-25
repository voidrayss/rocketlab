# RocketLab development status

Last updated: 2026-10-25 (America/New_York).

## Project overview

RocketLab is a static browser application for parametric rocket design, mass/CG
and Barrowman analysis, vertical RK4 flight simulation, and manufacturing CAD.
HTML/CSS/native ES modules have no build step or required backend. Node v24.22.1
is available for testing. Optional pinned Three.js and OpenCascade WASM libraries
load from CDNs; the CAD kernel runs in a worker. Model units are meters/kg/seconds;
CAD boundary units are millimeters. Consult AGENTS.md and docs/CAD.md.

## Completed features

- `4bc42ad`: original builder, mass/CG/CP, 21-metric analysis, motor catalog,
  flight simulator, 3D viewer, Onshape geometry/client scaffolding.
- `8a42604`: lazy optional 3D import and playback lifecycle fixes.
- `2e89132`: validated versioned JSON project save/load.
- `c0e4076`: altitude, velocity, acceleration, thrust, and burn-stability plots.
- `1587450`: parametric inline fin can, mass/CG/aerodynamic integration,
  genuine OpenCascade solids for fin cans/body tubes, verified STEP and
  adjustable STL export, metadata download, separate STEP inspection/preview,
  browser and CAD verification scripts.
- `0b840bd`: permanent AGENTS.md instructions
  and this authoritative status/roadmap, based on the actual repository state.

- `ea74d9d`: mass accounting,
  exact fin centroid, pad support/liftoff outcome, boxcar burnout splitting,
  transition CP singularity, nose aliases/shared 2D profile, motor endpoint and
  RASP validation. See docs/NUMERICS.md and smoke-numerics.mjs.

- `07a0161`: imported-CAD assembly/metadata: exact
  STEP/source/mesh persistence, density and transformed volume-centroid mass/CG,
  explicit internal or cylindrical body aerodynamic role, replace/add workflow,
  material/density and position/rotation editor, v2 native project support,
  SHA-256 source checks, guarded original body/fin-can parameter restoration.

- `b694799`: centering-ring milestone: exact internal annular
  volume/mass/CG, absolute placement, editable geometry/material, builder/3D,
  native project persistence, STEP/STL/metadata export and restoration support.

- `0a94077`: deployment preparation: inactive
  manual/main-only GitHub Pages template, exact activation/rollback instructions,
  and local /rocketlab/ project-path browser test. Nothing enabled or deployed.

- `9620f7a`: OpenRocket reference milestone: executed installed
  OpenRocket 24.12 headlessly for matching conical/ogive static geometries;
  recorded JAR hash, conditions, actual CP/mass/CG/Cd and fin centroid; reproducible
  optional driver and frozen comparison tests. No OpenRocket implementation
  copied or required by the website. See docs/OPENROCKET_VALIDATION.md.

- `ae91bfd`: shared-workspace/attachment milestone: pure
  dependency solver and atomic edits, body-aware nose/fin-can recreation,
  automatic/manual/locked diameter sizing, over/inside/butt fit and offsets,
  isolated live Part Studio, project-part library/portable part files, v3 stable
  identities/relationship remapping, visibility/exploded display, 3D selection,
  and toggleable CG/CP markers. See docs/WORKSPACES.md.

- `20129db`: manufacturing-nose milestone: optional fitted
  hollow/solid shoulder and join web, radial-wall nose profile, shared analytic
  volume/CG and B-rep, STEP/STL/metadata support for all six nose families, and
  body-aware creation. Legacy noses preserve prior mass behavior. Curved profiles
  use 48 axial bands rather than analytic spline surfaces.

- `a522be4`: fin-overhang milestone: signed root offsets,
  complete unclipped plates with supported root connectors, analytic union
  volume/CG, actual CP positions, overall forward/aft bounds, body-based motor
  position/fineness, matching 2D/3D and validated STEP/STL geometry.

- Fin-controls/search milestone (commit containing this entry): flat rectangular,
  trapezoidal, swept, clipped-delta/custom presets; derived leading/trailing angle
  edits; independent cross-section field with unsupported choices disabled;
  deterministic constrained mass/static-stability search with explicit apply and
  stale-state rejection; optional debounced selected-solid regeneration.
  This is an approximate finite-grid search, not aerodynamic/structural validation.

## Current development phase

Implement the two new user directives for Builder/CAD/manufacturing and Part
Studio/Assembly. Shared state, constraints, recreation, workspaces and markers
and shoulders are operational. Flat fin presets, consistent angles, constrained
static candidate search and opt-in live CAD regeneration are also operational.
Next: additional validated fin geometry, authoritative motors and recovery settings.
Keep the existing CAD and numerical corrections intact.

## Remaining roadmap (current user priority)

1. Shoulder refinements: optional fillets/transition, richer analytic curved
   surfaces or controlled adaptive profile accuracy. Initial fitted shoulder,
   solid export and matched mass/CG are complete.
2. Refine cantilever/root stress and support recommendations; initial signed
   fin offsets/overhang, connected solids and engineering/display integration
   are complete. Connectivity alone is not structural validation.
3. Elliptical/rounded planforms, non-flat cross-sections and root fillets remain.
   Flat presets/angle controls and deterministic mass/static-stability search are
   complete. Drag/strength/manufacturability optimization remains unimplemented.
4. Real sourced motor catalog expansion, file import, duplicate prevention,
   manufacturer/class filters and search; no invented manufacturer data.
5. Recovery-system component/editor with mass/placement/cord data, deployment
   configuration, chute drag and descent/energy outputs.
6. Workspace refinements: richer CAD generators, per-dimension locks, automatic
   fit/interference checks, assemblies beyond supported body relationships.
7. Remaining numerical fidelity and OpenRocket flight comparisons; cross-vendor
   CAD verification and advanced manufacturing parts. Existing static references
   show mass/drag differences; do not erase them with arbitrary fitting.
8. Publication awaits explicit approval. Pages template is inactive; do not
   merge main, enable hosting, change DNS or deploy without authorization.

## Test results

Verified 2026-10-25 (America/New_York):

- `node scripts/check.mjs`: all sixteen smoke tests and source syntax PASS, including assembly constraints.
  Includes numerical analytic references, all 12 shipped motor files, imported
  geometry schema/mass/CG/transforms/persistence, rings, and static OpenRocket
  CP/fin-centroid checks.
- Real-kernel suite and separate OCCT importer PASS: 2/3/4/6/12-fin solids,
  four fin presets and supported overhangs, six nose families with joined hollow/
  solid shoulders, analytic volume/CG, STEP round trips, tube/ring volume/centroid, adjustable
  tessellation, invalid geometry/STEP inputs.
- Chrome online, CDN-blocked, and /rocketlab/ subpath runs PASS: builder/editing,
  3D orbit/zoom, native JSON controls and downloads, graphs/playback, CAD worker,
  STEP/STL/metadata downloads, source-fingerprint parameter restoration,
  replacement without extra components, imported density/rotation and v2
  project round trip, ring solid generation/persistence, and offline fallback.
  New workspace checks include Part Studio live edits, orthographic view, library
  and part files, attachment recreation, direct 3D selection, markers and v3
  identity/relationship reload; offline part editing also PASS. Shoulder unit
  and kernel checks cover all six families, hollow/solid and no-shoulder shells,
  volume/centroid equality, topology and independent STEP-reader opening. Fin
  overhang cases also pass exact volume/CG, real extents, single-solid topology,
  STEP read-back and the independent reader.
  OS file dialog is intercepted through DevTools, not visually automated.
- Inactive Pages template parses via Ruby/Psych; manual-only trigger/main guard
  confirmed. Actual deployment is untested and not enabled.
- Actual installed OpenRocket 24.12 runner PASS for conical/ogive static cases.
  CP deltas −0.047/+0.089 mm; fin centroid matches. Structure mass is RocketLab
  82.249 vs OR 79.240 g (conical), 82.249 vs 88.848 g (ogive); Cd differs too.
  No equivalent complete OpenRocket motor/recovery flight has been run.
- Corrected C6 regression: ~185.7 m apogee, 108.05 g loaded, ~0.99 cal.
  The historical 166.2 m included duplicated motor casing; see NUMERICS.md.


Latest fin-controls checks: 16 smoke tests/syntax PASS; real kernel/independent
STEP reader PASS for four flat presets, overhangs and six nose families; Chrome
online PASS including preset/angle rejection, search/apply and automatic selected
solid generation; CDN-blocked fallback PASS. The project-subpath run also PASSes edits
while automatic regeneration is already enabled.

## Known bugs and limitations

- Atmosphere only implements the troposphere; high-altitude extrapolation and
  its bounds are not validated. Exact flight-event interpolation remains pending.
- Legacy noses retain thin conical-shell mass; manufacturing noses now use
  radial-wall profiles with 48 axial samples and joined shoulder geometry.
  Ordinary body tubes still use a thin shell approximation. Haack/parabolic/elliptical CP still uses an ogive estimate.
- Approximate shipped motor curves; drag/fin flutter are simplified; no wind,
  attitude dynamics, or independently validated structural safety predictions.
- Imported CAD requires an explicit internal/body aerodynamic interpretation;
  arbitrary fin/nose aerodynamics and fit/overlap are not inferred. Body proxy
  dimensions must be confirmed, especially after rotations. Saved project asset
  hashes are checked but properties are not rerun through the kernel at reload.
- Companion metadata v1 lacks a source fingerprint and cannot automatically restore.
  Changed geometry uses custom CAD fallback. Native projects preserve loaded
  metadata, source bytes/hash, properties and mesh; original external feature
  history, names/colors and arbitrary source metadata are not reconstructed.
- No fillets/airfoil fins; no full-assembly CAD export. Onshape remains scaffolding
  and does not recognize fin cans in its separate FeatureScript preview.
- Cross-vendor Onshape/FreeCAD/SolidWorks/Fusion opening is unverified.
- HANDOFF.md is a pre-existing untracked Base64 document; preserve it untouched.

## Architecture decisions

- Preserve lazy cross-calls in intentional aero.js/physics.js circular imports.
- New fin cans attach over the aft body with explicit clearance; inside and
  butt connections are optional. Legacy attachment-free fin cans stay inline.
  Its exact union volume/centroid includes curved roots; hidden covered surfaces
  are excluded from wetted area. Inside-body configurations need manual slots.
- Direct `replicad-opencascadejs@0.20.2` bindings from jsDelivr, no high-level
  replicad dependency or npm install; Three.js remains at 0.160.0. See notices.
- CAD STEP exported solids are checked by BRepCheck and read back before download.
  Read-back geometry, source parameters, and aerodynamic interpretations are
  distinct. Metadata v1 remains readable for comparison; v2 is exported with source hash.
- Native v3 retains stable uid identities, assembly relationships, names,
  visibility and library membership. Numeric runtime IDs/attachments are remapped
  on load. v1/v2 remain supported. v2 introduced imported CAD assets
  and measured properties, capped at 50 MB/project and 20 MB/source STEP.
  All component IDs are fresh on load. Metadata v2 records exact STEP SHA-256;
  parameter restoration also regenerates and compares solid properties.

## GitHub and deployment

- origin: https://github.com/voidrayss/rocketlab.git
- Active/tracking branch: development/rocketlab-2; latest prior implementation b694799, deployment preparation 0a94077;
  9620f7a records external reference validation; ae91bfd adds workspaces,
  20129db adds shoulders, a522be4 adds overhangs.
- main remains at 4bc42ad. Routine tested commits/pushes on development authorized.
- Audit 2026-10-25: GitHub Pages disabled; homepage unset; no deployments,
  Actions workflows, custom domain, or local hosting configuration identified.
- Only supplied URL is http://localhost:8000, a local static server, not public.
  External hosting cannot be identified without a URL/provider. No deployments
  or hosting settings were changed. Any publication requires explicit approval.
  Prepared instructions/template do not activate a workflow or publication.

## Next actions

1. Read AGENTS.md, this file, status/history; preserve HANDOFF.md.
2. Extend validated fin geometry (root fillets/non-flat sections), then expand
   sourced motors/import/filtering and recovery editor/simulation as ordered above.
3. Continue the ordered roadmap above, updating this status and committing/
   pushing each tested milestone to development/rocketlab-2.
4. CAD binaries/readers are temporary development utilities, not workspace or
   website build dependencies; see docs/CAD.md for reproduction paths.
