# Fin cans and solid CAD

## Operational workflows

Add a fin can from the Builder. It replaces separate tail fins and adds an
inline hollow sleeve to the axial stack. It does not slide over an existing
body tube. Existing body sections retain their length; total rocket length grows
by the sleeve length. Only one fin can is permitted, without a duplicate tail
fin set. The UI and JSON importer enforce this constraint.

Edit sleeve length, outside/inside diameters, fin count, root/tip chord, span,
sweep, thickness, and material. Wall thickness is derived as (OD − ID)/2.
Changes commit on Enter or blur. Invalid combinations leave the previous model
intact. The current manufacturing profile is flat, with no fillets. Fins must
fit axially within the sleeve and remain separated radially.

The sleeve and fins are one component in mass breakdowns. Its volume is the
exact annular-cylinder volume plus the non-overlapping portions of extruded
trapezoidal fins, including the curved cylinder/rectangular-root intersection.
Its axial centroid is volume weighted. The CAD kernel's volume/centroid agree
with this independent analytic calculation. Uniform material density converts
volume into mass. Existing mass approximations for other components are unchanged.
Barrowman uses one fin contribution at the actual root axial position, with the
sleeve counted as one straight body section. Step/interference drag is not modeled;
flutter is a simplified first-fin-set estimate, not structural certification.

Select a body tube or fin can, expand **Solid CAD · STEP / STL**, and generate.
The optional WebAssembly kernel loads into a worker on first use. It creates
analytic cylindrical B-rep surfaces, planar fin prisms, and Boolean unions and
cuts. The fin roots penetrate the sleeve during construction and the union
removes their shared volume. The final bore remains open and the fin can must
contain exactly one valid solid. These are CAD solids, not converted triangle
meshes. The CAD preview tessellates that B-rep; the regular Builder viewer is a
lighter visual representation.

Download STEP, STL, or metadata after generation. STEP is reopened by the reader
and checked for valid topology, positive volume, matching volume and solid count.
STL is tessellated with the chosen 0.01–2 mm chord tolerance; angular deflection is
0.25 radians. Units are millimeters, with +Z along the sleeve front-to-rear and
+X radial. Editing or changing selection invalidates old generated downloads.
Metadata records the original parameters, material, units/axes, measured volume,
centroid, bounds, and tessellation tolerance.

**Inspect STEP file** accepts a local STEP/STP up to 20 MB. It imports actual
B-rep geometry, validates it, reports solid count, volume (mm³), centroid/bounds
(mm), and renders its tessellation. Inspection remains separate until an explicit assembly action is chosen;
see the imported-CAD assembly workflow below.

## Dependencies and zero-build architecture

The application imports the published `replicad-opencascadejs@0.20.2` loader and
WASM from jsDelivr in `js/cad/worker.js`. This is a custom OpenCascade.js kernel
build; the application uses its bindings directly and does not depend on the
higher-level replicad library. No npm packages, bundler, compiled project assets,
backend, or Node runtime are required by the website. Three.js remains pinned
at 0.160.0. CAD and 3D need their CDNs; the 2D builder and numerical engine do not.

Source/build configuration: https://github.com/sgenoud/replicad/tree/24b0570eda7090dd06f76a8083979647be62010e/packages/replicad-opencascadejs
OpenCascade.js: https://ocjs.org/docs/about
Upstream OCCT source: https://github.com/Open-Cascade-SAS/OCCT
Licensing and attribution: [THIRD_PARTY.md](../THIRD_PARTY.md).

## Reproducible verification

Run the offline logic and syntax checks:

```bash
node scripts/check.mjs
```

For real-kernel tests, download the external loader and WASM to a temporary
folder (these are development artifacts, not project dependencies):

```bash
curl -L --fail https://cdn.jsdelivr.net/npm/replicad-opencascadejs@0.20.2/src/replicad_single.js -o /tmp/rocketlab-oc.mjs
curl -L --fail https://cdn.jsdelivr.net/npm/replicad-opencascadejs@0.20.2/src/replicad_single.wasm -o /tmp/rocketlab-oc.wasm
curl -L --fail https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js -o /tmp/rocketlab-independent.cjs
curl -L --fail https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.wasm -o /tmp/rocketlab-independent.wasm
node scripts/cad-check.mjs /tmp/rocketlab-oc.mjs /tmp/rocketlab-oc.wasm /tmp/rocketlab-independent.cjs /tmp/rocketlab-independent.wasm
```

This tests 2/3/4/6/12 fins, exact volume/centroid agreement, single-solid topology,
STEP reopening, an independently packaged STEP importer, its tessellated volume
within 1%, hollow tube dimensions/volume, resolution changes, and invalid inputs.
The independent importer is an OCCT-based implementation too, not a separate CAD
kernel. Cross-vendor opening in Onshape/FreeCAD/SolidWorks remains unverified.

With Google Chrome installed, run actual browser interaction tests:

```bash
node scripts/browser-check.mjs
node scripts/browser-check.mjs --offline
```

Set `CHROME_PATH` if Chrome is elsewhere. The script serves the static project,
launches an isolated headless browser, tests fin-can editing, WebGL, JSON download
and native file-input assignment, graphs/playback, CAD generation, CAD downloads,
stale-export invalidation, STEP import, and CDN-blocked startup/error recovery. It writes artifacts/screenshots to a
temporary directory and leaves the workspace untouched. It requires network
access to the CDNs and OS permission to run Chrome and bind a local port. File
inputs are populated through Chrome DevTools; the OS file-chooser dialog itself
is not automated. There is no project npm installation.

## Limitations and next work

Imported geometry now supports assembly placement, density/mass/CG, explicit
internal/body aerodynamic interpretation, native-project persistence, and guarded
metadata restoration (see below). Arbitrary aerodynamic recognition, foreign
feature histories, and automatic external-edit reconstruction remain unsupported.

Fin-root fillets, airfoil sections, slip-over sleeves, fit clearances, structural
analysis, full-assembly exports, and CAD solids for noses/transitions remain to
be implemented. Onshape's separate preview scaffolding does not yet recognize
fin cans; use the working local STEP export for this component.

Confirmed mass accounting, fin centroid, launch support, burnout, nose alias,
and transition CP bugs have since been corrected; see [NUMERICS.md](NUMERICS.md).
The corrected C6 baseline is ~185.7 m. Shipped thrust curves remain approximate,
and cross-model flight validation remains to be performed.

## Hosting audit (2026-10-25)

`origin` is https://github.com/voidrayss/rocketlab. GitHub reports Pages disabled,
no homepage URL, no deployment records, and no Actions workflows. No hosting
configuration or custom domain exists in this workspace. The only supplied URL,
http://localhost:8000, is a local static server, not a public website. An external
host linked outside GitHub cannot be identified without its URL/provider.
Development changes are pushed only to `development/rocketlab-2`. No hosting
settings or production deployments were changed.

## Imported CAD in the assembly (2026-10-25)

After inspecting STEP, choose **Replace selected component** (default) or
**Add a separate physical part**, choose a material and aerodynamic interpretation,
and click **Use imported CAD in rocket**. Replace removes the selected physical
part rather than counting its old mass alongside the imported replacement.

- **Internal** adds only measured volume × density to mass and CG. It does not
  add stack length, reference area, CP, or drag. Its axial offset is an absolute
  position from the nose; the user must confirm it fits inside the rocket.
- **Body** is an explicit user-confirmed cylindrical aerodynamic proxy. Set its
  stack length and diameter before attaching. These govern stack layout,
  reference area and body wetted-area approximation, not the real CAD volume.
  It supplies no fin or nose CP. Arbitrary STEP fins/noses are not inferred.

The selected imported part's editor controls name, density (kg/m³), material,
proxy length/diameter, axial/radial offsets, and X/Y/Z source rotations in degrees.
Changing material resets density; density can then be overridden explicitly.
External axial offset is relative to its stack start. Source geometry is centered
radially on its bounding box and starts at minimum source Z, then rotated X/Y/Z;
source +Z maps to the rocket's nose-to-tail axis. Mass uses exact saved B-rep
volume in mm³ × 1e-9 × density, and axial CG uses the transformed saved centroid.
The builder displays the proxy/centroid; the 3D viewer displays the actual mesh.
Proxy dimensions must be reconsidered after rotations. Overlap/fit checks for
arbitrary shapes are not automatic; adding a separate physical part is explicit.

Native projects containing imported CAD use **rocketlab v2**, embedding original
STEP bytes as Base64, SHA-256 fingerprint, measured properties, tessellation,
placement, material/density, and loaded companion metadata. Other projects remain
v1; both versions load. The file limit is now 50 MB, with each source STEP ≤20 MB.
Project load verifies the source fingerprint before changing the assembly.
Saved geometry properties/mesh are schema-checked and restored without running
OpenCascade; source hashing detects byte corruption, not falsified geometric
properties. Reinspect the source STEP when independent property verification is
needed. This permits offline project loading and preserves original geometry.

### Companion metadata restoration

New metadata downloads use **rocketlab-cad v2**, including the exported STEP
SHA-256 and original parameters/material. Inspect the STEP, then **Load companion
metadata**. Restoration is enabled only when source bytes and measured
volume/centroid/bounds/solid count match. **Restore original parametric part**
regenerates the proposed body/fin-can solid and compares those properties again
before applying the selected assembly action. Restored native parameters retain
the source STEP hash as provenance. Changing geometry externally, changing source
bytes, or incompatible parameters disables/restores with an error; the custom
CAD workflow remains available. Version-1 metadata can be compared but cannot
establish an unchanged source because it has no fingerprint.

This does not automatically identify arbitrary CAD, reconstruct external feature
history, restore foreign names/colors, or prove arbitrary source geometry has the
same surfaces just because aggregate properties agree. The exact source hash is
required too. No cross-vendor CAD application compatibility claim is added.

Verified: new `smoke-imported.mjs` schema/transform/mass/CG/proxy/persistence and
metadata tests, plus real Chrome original-parameter restoration, replacement
without extra components, density/rotation edits, and native CAD project round
trip. Existing real-kernel and independent-reader tests continue to pass.
