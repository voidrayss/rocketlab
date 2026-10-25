# RocketLab engineering instructions

## Start and continuity

Read this file, `DEVELOPMENT_STATUS.md`, recent commits, and the actual working
tree before starting work. Consult `README.md` and `docs/CAD.md` for workflows.
`DEVELOPMENT_STATUS.md` is the authoritative current-state record; verify its
claims when relevant. Update it after each tested milestone and at session end.
Keep permanent rules here and temporary progress in the status document.

## Objective and architecture

Build a browser-based rocket design, engineering-analysis, flight-simulation,
and manufacturing-CAD application. Preserve existing capabilities. Distinguish
operational, experimental, scaffolded, and planned features in UI and reports.
Do not represent approximate engineering calculations as validated safety claims.

- Keep a static, zero-build-step site: HTML, CSS, native JavaScript ES modules,
  Canvas, and pinned CDN dependencies for optional capabilities.
- No npm installation, bundler, framework, or required Node/server runtime for
  the standalone website. Node is for tests and development utilities only.
- Use focused modules, named exports, SI units in the rocket/physics model,
  and explicit millimeter conversions at the CAD boundary. Keep pure logic
  independent of DOM, CDN imports, and WebGL so headless tests remain possible.
- Preserve the dark theme and existing module split. Prefer small coherent
  changes, clear names, input validation, and actionable error messages.
- Validate imported files before replacing the active project. Preserve user
  work on errors. Allocate fresh component IDs on native project import.

## Physics and aerodynamics

Preserve the RK4 simulator and aerodynamic engine. Correct confirmed errors
with evidence and regression tests; do not rewrite working models speculatively.
Document changed assumptions, units, reference cases, and numerical baselines.
`aero.js` and `physics.js` intentionally import each other: cross-module calls
must remain inside function bodies, never during module initialization.
Avoid counting a physical sleeve, fin set, motor casing, or imported part twice.
Arbitrary CAD geometry has no automatic aerodynamic meaning: require a user
interpretation or keep it out of applicable aerodynamic calculations explicitly.
Review licenses before copying reference implementations such as OpenRocket.

## Shared components and workspaces

Part Studio and Assembly edit the same component objects. Use the atomic edit/
creation functions in components.js; resolve dependencies through assembly.js.
Do not introduce independent editable part copies in another workspace. Engines
use a resolved, assembled-only view; library-only definitions have no engineering
contribution. Visibility and exploded display are renderer settings, not mass or
physics changes. Native v3 preserves stable part uid values while numeric runtime
IDs are fresh on load; remap every attachment before dependency validation.
Individual part import creates a fresh identity and an unassembled library part.
Parent deletion preserves dependent parts in the library rather than discarding
work or guessing a new parent. Locked/automatic diameter relationships must not
be silently overwritten by manual dimension edits.

## CAD

Use the existing optional OpenCascade worker and direct bindings. Generate
actual B-rep solids; Three.js displays tessellations and is not the solid kernel.
Keep loader/WASM versions pinned and CDN dependencies lazy. Do not introduce a
build pipeline to make CAD work. Maintain source/license notices in THIRD_PARTY.md.
Validate topology, solid count, dimensions, volume, centroid, and serialization
round trips. A downloaded STEP file alone is not evidence of correct geometry.
Do not claim cross-vendor compatibility without testing that application/parser.
Keep imported geometry, source parameters, and manually supplied aerodynamic
interpretations distinct. External modifications can invalidate metadata.

## Tests

Run `node scripts/check.mjs` after meaningful changes; it runs smoke tests and
JavaScript syntax checks. Add focused regressions for fixes and new behavior,
including malformed inputs, unit conversions, and import/export round trips.
For geometry changes run `scripts/cad-check.mjs` with the pinned temporary kernel
and optional independent-reader files as documented in `docs/CAD.md`.
For UI changes run `node scripts/browser-check.mjs` and its `--offline` mode.
These browser checks use installed Chrome, a temporary server/profile/download
folder, and no npm dependencies. Report actual results and unverified limits.

## Git, deployment, and security

Repository: https://github.com/voidrayss/rocketlab
Development branch: `development/rocketlab-2`.
Inspect status before staging; preserve unrelated or untracked user files,
including the pre-existing HANDOFF.md. Stage only intentional task changes.
After a coherent milestone passes relevant checks, update the status document,
make a descriptive commit, push the development branch, and verify success.
Routine commits/pushes are authorized without repeated confirmation.
Never force-push, rewrite shared history, discard user changes, delete branches,
or merge into main without explicit authorization. Report failed pushes and
resolve non-destructively. Never commit credentials or expose tokens in logs.
Keep Onshape secrets out of client code. Do not enable Pages, deploy, alter DNS,
or overwrite a public site without explicit approval. Preparing configuration
and instructions is authorized; publication is a separate step.

## Autonomy

Continue with the highest-priority unfinished task in DEVELOPMENT_STATUS.md.
Do not stop just to ask which routine task comes next. Complete as many coherent,
tested milestones as the session permits. If one task is blocked, document why
and continue independent work. Ask only for necessary credentials, irreversible
operations, risks to existing work, unresolved major architecture/scope choices,
or environment constraints that genuinely require user input.
Continuation command: “Continue RocketLab development from DEVELOPMENT_STATUS.md.”
