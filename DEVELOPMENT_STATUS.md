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

- OpenRocket reference milestone (commit containing this entry): executed installed
  OpenRocket 24.12 headlessly for matching conical/ogive static geometries;
  recorded JAR hash, conditions, actual CP/mass/CG/Cd and fin centroid; reproducible
  optional driver and frozen comparison tests. No OpenRocket implementation
  copied or required by the website. See docs/OPENROCKET_VALIDATION.md.

## Current development phase

Priority 4: advanced parametric manufacturing components and continued numerical
validation. Imported-CAD assembly and guarded metadata restoration are operational
with the explicit limitations below. Pages preparation is complete but inactive.
Static OpenRocket differences now provide evidence for further mass/drag review.
Do not restart or replace the working CAD pipeline.

## Remaining roadmap (priority order)

1. Further numerical reliability: shape-aware nose mass/CP, exact shell masses,
   atmosphere range, event interpolation, and OpenRocket comparisons. Initial
   confirmed corrections are complete; see docs/NUMERICS.md.
2. Imported CAD refinements: broader aerodynamic proxies, fit/overlap inspection,
   full source-geometry revalidation on project reload when requested. Initial
   internal/body roles, position/rotation/density, mass/CG and persistence are done.
3. Metadata refinements: support more part families as their CAD generators arrive.
   Current v2 exact-source + properties + regeneration gate is operational for
   bodies/fin cans/rings, with custom fallback for changed source or legacy metadata.
4. Advanced CAD: root fillets, fin profiles, through-wall fins, mounts, rings,
   couplers, bulkheads, electronics and recovery compartments. Centering rings
   are complete; fit/structural checks are still manual.
5. Interoperability: test actual external CAD applications where available;
   do not equate the separately packaged OCCT reader with a separate CAD kernel.
6. OpenRocket: initial actual static cases/license review complete. Next compare
   an equivalent full motor/recovery flight (apogee/speed/acceleration/duration)
   and loaded stability with matched motor/environment. Static CP agrees within
   0.1 mm; mass/CG/Cd differences are documented, not corrected by arbitrary fitting.
7. Deployment activation awaits explicit approval. Template/instructions are
   prepared in docs/DEPLOYMENT.md and docs/deployment/github-pages.yml.example;
   no workflow exists under .github/workflows. Do not enable, publish, merge main
   or change DNS without authorization.


## Test results

Verified 2026-10-25 (America/New_York):

- `node scripts/check.mjs`: all twelve smoke tests and source syntax PASS.
  Includes numerical analytic references, all 12 shipped motor files, imported
  geometry schema/mass/CG/transforms/persistence, rings, and static OpenRocket
  CP/fin-centroid checks.
- Real-kernel suite and separate OCCT importer PASS: 2/3/4/6/12-fin solids,
  analytic volume/CG, STEP round trips, tube and ring volume/centroid, adjustable
  tessellation, invalid geometry/STEP inputs.
- Chrome online, CDN-blocked, and /rocketlab/ subpath runs PASS: builder/editing,
  3D orbit/zoom, native JSON controls and downloads, graphs/playback, CAD worker,
  STEP/STL/metadata downloads, source-fingerprint parameter restoration,
  replacement without extra components, imported density/rotation and v2
  project round trip, ring solid generation/persistence, and offline fallback.
  OS file dialog is intercepted through DevTools, not visually automated.
- Inactive Pages template parses via Ruby/Psych; manual-only trigger/main guard
  confirmed. Actual deployment is untested and not enabled.
- Actual installed OpenRocket 24.12 runner PASS for conical/ogive static cases.
  CP deltas −0.047/+0.089 mm; fin centroid matches. Structure mass is RocketLab
  82.249 vs OR 79.240 g (conical), 82.249 vs 88.848 g (ogive); Cd differs too.
  No equivalent complete OpenRocket motor/recovery flight has been run.
- Corrected C6 regression: ~185.7 m apogee, 108.05 g loaded, ~0.99 cal.
  The historical 166.2 m included duplicated motor casing; see NUMERICS.md.


## Known bugs and limitations

- Atmosphere only implements the troposphere; high-altitude extrapolation and
  its bounds are not validated. Exact flight-event interpolation remains pending.
- All nose masses use thin conical shells, and ordinary body tubes use a thin
  shell approximation. Haack/parabolic/elliptical CP still uses an ogive estimate.
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
- Fin can is an inline sleeve section, not a slip-over tube; adding it replaces
  separate tail fins. Its exact union volume/centroid include curved roots.
- Direct `replicad-opencascadejs@0.20.2` bindings from jsDelivr, no high-level
  replicad dependency or npm install; Three.js remains at 0.160.0. See notices.
- CAD STEP exported solids are checked by BRepCheck and read back before download.
  Read-back geometry, source parameters, and aerodynamic interpretations are
  distinct. Metadata v1 remains readable for comparison; v2 is exported with source hash.
- Native format: rocketlab v1 remains supported; v2 embeds imported CAD assets
  and measured properties, capped at 50 MB/project and 20 MB/source STEP.
  All component IDs are fresh on load. Metadata v2 records exact STEP SHA-256;
  parameter restoration also regenerates and compares solid properties.

## GitHub and deployment

- origin: https://github.com/voidrayss/rocketlab.git
- Active/tracking branch: development/rocketlab-2; latest prior implementation b694799, deployment preparation 0a94077;
  this milestone records external reference validation.
- main remains at 4bc42ad. Routine tested commits/pushes on development authorized.
- Audit 2026-10-25: GitHub Pages disabled; homepage unset; no deployments,
  Actions workflows, custom domain, or local hosting configuration identified.
- Only supplied URL is http://localhost:8000, a local static server, not public.
  External hosting cannot be identified without a URL/provider. No deployments
  or hosting settings were changed. Any publication requires explicit approval.
  Prepared instructions/template do not activate a workflow or publication.

## Next actions

1. Read AGENTS.md, this file, git status/history; preserve HANDOFF.md.
2. Implement the next advanced manufacturing component or root-fillets with
   kernel/analytic consistency tests; preserve the imported-CAD assembly pipeline.
   Review actual OpenRocket mass/CG differences before refining existing shell
   models. A matched flight comparison is still needed; do not claim equivalence.
3. Run smoke/syntax checks and relevant browser/CAD checks; update this document,
   commit and push the milestone, then continue with the next unfinished task.
4. Obtain temporary kernel/reader paths using docs/CAD.md if needed; never add
   downloaded binaries or credentials to the workspace history.
