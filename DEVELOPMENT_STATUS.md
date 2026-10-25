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
- Continuity milestone (this document's commit): permanent AGENTS.md instructions
  and this authoritative status/roadmap, based on the actual repository state.

## Current development phase

Priority 1: reproduce and correct confirmed numerical issues with regressions,
then integrate imported CAD components and metadata into the rocket assembly.
Do not restart or replace the working CAD pipeline.

## Remaining roadmap (priority order)

1. Numerical reliability: correct motor casing double-count, transition CP
   singularity, nose alias inconsistency, launch-pad handling, and additional
   confirmed mass/CG/interpolation/unit issues. Establish changed baselines with
   evidence and retain the engines rather than rewriting them.
2. Imported CAD assembly components: explicit positioning/orientation, density,
   mass/centroid integration, user-provided aerodynamic role/parameters, builder
   and 3D support, native-project persistence of geometry and metadata.
3. Metadata restoration: compare imported geometry with exported identity and
   parameters; restore compatible parts, flag differences, retain custom fallback.
4. Advanced CAD: root fillets, fin profiles, through-wall fins, mounts, rings,
   couplers, bulkheads, electronics and recovery compartments.
5. Interoperability: test actual external CAD applications where available;
   do not equate the separately packaged OCCT reader with a separate CAD kernel.
6. OpenRocket reference cases and license review; compare assumptions and
   mass/CG/CP/stability/drag/trajectory results before adopting formulas/code.
7. Prepare static GitHub Pages configuration/instructions without enabling,
   deploying, merging main, or changing DNS absent explicit approval.

## Test results

- 2026-10-25, current checkout `1587450`: `node scripts/check.mjs` rerun;
  all eight smoke tests plus JavaScript syntax checks PASS.
- Prior milestone `1587450` reported (rerun when affected): real-kernel tests
  for 2/3/4/6/12 fins, analytic volume/centroid, STEP topology/round trip,
  independently packaged STEP-reader/tessellated-volume checks, adjustable
  tessellation, invalid input tests PASS.
- Prior milestone reported: installed Chrome online/offline checks for builder,
  3D orbit/zoom, JSON controls/download/input assignment, graphs/playback, CAD
  preview/download/import, stale-export protection, and CDN failures PASS.
- Original C6 baseline ~166.2 m includes the known casing double-count; it is
  a regression reference, not independent physical validation.

## Known bugs and limitations

- Flight callers add spent casing to structural dry mass while physics adds
  full motor mass: casing is counted twice. Regression correction pending.
- Equal-diameter transitions divide by zero in CP; conical aliases are not
  handled consistently in CP and the 2D profile.
- Curve-motor initial zero thrust can send the unconstrained state below ground
  and terminate before liftoff. Launch detection/event handling needs correction.
- Atmosphere only implements the troposphere; extrapolation is not valid at
  arbitrary altitudes. Input validation/integration bounds require review.
- Separate fin CG and non-conical nose mass use simplified approximations.
- Approximate shipped motor curves; drag/fin flutter are simplified; no wind,
  attitude dynamics, or independently validated structural safety predictions.
- STEP import is separate inspection only. Native projects do not yet retain
  imported CAD or restore companion metadata. No automatic aerodynamic inference.
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
  distinct. Current metadata version is rocketlab-cad v1.
- Current native format is rocketlab v1 with validated components/fresh IDs.

## GitHub and deployment

- origin: https://github.com/voidrayss/rocketlab.git
- Active/tracking branch: development/rocketlab-2; latest implementation 1587450.
- main remains at 4bc42ad. Routine tested commits/pushes on development authorized.
- Audit 2026-10-25: GitHub Pages disabled; homepage unset; no deployments,
  Actions workflows, custom domain, or local hosting configuration identified.
- Only supplied URL is http://localhost:8000, a local static server, not public.
  External hosting cannot be identified without a URL/provider. No deployments
  or hosting settings were changed. Any publication requires explicit approval.

## Next actions

1. Read AGENTS.md, this file, git status/history; preserve HANDOFF.md.
2. Reproduce numerical issues with deterministic tests, correct confirmed errors,
   and document intentionally changed C6 predictions rather than hiding changes.
3. Run smoke/syntax checks and relevant browser/CAD checks; update this document,
   commit and push the milestone, then proceed to imported-CAD assembly support.
4. Obtain temporary kernel/reader paths using docs/CAD.md if needed; never add
   downloaded binaries or credentials to the workspace history.
