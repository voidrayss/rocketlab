# 🚀 RocketLab — CAD + Flight Simulator

An OpenRocket-inspired model rocket simulator you run in the browser. **Build**
a rocket from components in a lightweight 2D CAD view, watch its **stability**
(CG/CP/caliber margin) update live, pick a **motor**, then **launch** and watch
an animated flight with real-time telemetry.

No install or build step: plain HTML, CSS, ES modules, and Canvas. Optional 3D and CAD libraries load from pinned CDNs.

---

## How to run

**Option A — just open it:**
Open `index.html` in a browser. (Because it uses ES modules, some browsers need
it served over `http://` rather than `file://`. If the page is blank, use Option B.)

**Option B — tiny local server (recommended):**
```bash
# Python (any version 3)
python3 -m http.server 8000
# then open http://localhost:8000
```
Or in VS Code, install the **Live Server** extension and click "Go Live".

---

## What it does

- **Component CAD builder** — add/edit nose cone, body tubes, transitions, fins.
  The drawing updates live as you change dimensions and materials.
- **Live stability analysis** — computes mass, center of gravity (CG), center of
  pressure (CP) via the **Barrowman equations** (the same method OpenRocket uses),
  and the stability margin in calibers, with a STABLE / UNSTABLE verdict.
- **Motor selection** — legacy Estes/AeroTech boxcar presets (A8 to G80) plus a
  real Level-1 and Level-2 catalog loaded from RASP `.eng` thrust curves
  (H/I/J/K motors from AeroTech, Cesaroni/CTI, Estes).
- **Flight simulation** — RK4 numerical integration of the equations of motion
  with thrust, gravity, altitude-dependent drag, variable mass (fuel burn), and
  parachute recovery.
- **Animated flight view** — scrolling sky, flame on boost, parachute on descent,
  live gauges (altitude, velocity, Mach, mass, phase) and an altitude-vs-time plot.

---

## Code layout (and how to split the work)

```
index.html        # page + UI layout
css/style.css     # styling
js/
  rocket.js       # component data model + geometry helpers   ── Teammate A
  aero.js         # mass/CG, Barrowman CP, stability, drag     ── Teammate A
  builder.js      # CAD builder view (drawing + editor + UI)   ── Teammate A
  motors.js       # motor presets + thrust model               ── shared
  physics.js      # RK4 flight integrator                       ── Teammate B
  flight.js       # animated flight view + telemetry + plot     ── Teammate B
  main.js         # wires it all together                       ── shared
```

**Suggested split:**
- **Teammate A** owns the *design + aerodynamics* side: `rocket.js`, `aero.js`,
  `builder.js`.
- **Teammate B** owns the *simulation + visualization* side: `physics.js`,
  `flight.js`.
- `main.js` and `motors.js` are the shared seams — coordinate on those.

---

## The engineering you can talk about (interview gold)

- **Barrowman equations** for center of pressure — the real aerodynamic method
  for finned vehicles. See `aero.js`.
- **RK4 numerical integration** vs. Euler — accuracy and stability tradeoffs.
  See `physics.js`.
- **Static stability** — why CP must sit behind CG, and the 1–2 caliber rule.
- **Variable-mass dynamics** — thrust and mass change as propellant burns.
- **ISA standard atmosphere model** — density, pressure, temperature, and speed
  of sound fall off with altitude (U.S. Standard Atmosphere 1976 troposphere).

---

## Depth of information: the Analysis & Insights panel

RocketLab reports far more than a single apogee number. The Builder's right-hand
**Analysis & Insights** panel lists every metric below with its value, a short
plain-language note on *what it means and why it matters*, and a citation for the
method. The idea is that the tool teaches as it measures, no matter how niche the
number is. Everything is pure math added additively to the existing engine, so
the validated flight model is unchanged.

Metrics and methods:

- **Mass and per-part mass breakdown** (grams and percent per component) from the
  thin-shell mass model in `aero.js`.
- **Center of gravity (CG)** mass-weighted centroid, and **center of pressure
  (CP)** via the **Barrowman equations** (Barrowman 1966).
- **Stability margin** in calibers with a stable / marginal / over-stable
  interpretation (the 1 to 2 caliber rule of thumb).
- **Fineness ratio** (length / diameter), a slenderness number for drag and
  structural behavior.
- **Nose shape family + drag character.** The model now supports conical, tangent
  ogive, Von Karman (LD-Haack), LV-Haack, parabolic, and elliptical profiles.
  `noseConeProfile()` in `rocket.js` generates each profile from its standard
  equation (Crowell 1996, "The Descriptive Geometry of Nose Cones").
- **Drag coefficient (Cd)** refined to depend on the nose shape family and
  fineness ratio.
- **Wetted area** from a surface-of-revolution over the nose profile plus tube
  and frustum lateral areas, and **skin-friction drag** using the turbulent
  flat-plate correlation Cf = 0.074 / Re^0.2 (Schlichting, "Boundary-Layer
  Theory"; Hoerner, "Fluid-Dynamic Drag").
- **Fin aspect ratio, taper ratio, mean aerodynamic chord**, and a **fin flutter
  velocity** estimate (fin-flutter boundary, NACA TN 4197 / standard hobby
  derivation) with a warning when the predicted top speed approaches it. A
  per-material shear-modulus map feeds the flutter formula.
- **Thrust-to-weight ratio**, **rail-exit velocity** (at a 1 m rail),
  **max dynamic pressure (max-Q)**, **max acceleration (g)**, **descent rate**
  under the parachute, and a **stability-versus-time** curve (the CG shifts
  forward as rear-mounted propellant burns off) from `physics.js`.

The report is assembled in `js/analysis.js` (`buildReport(rocket, motor)`), which
pairs every metric with its explanation and citation. Headless validation lives
in `scripts/smoke-analysis.mjs`.

---

## Motor database: RASP .eng thrust curves

Beyond the simple boxcar presets, RocketLab ships a catalog of **real certified
hobby motors** whose thrust curves are loaded from `.eng` files at runtime. The
motor dropdown is populated in two passes: the legacy presets appear immediately
(so the app works offline), then the `.eng` catalog is fetched and the list is
rebuilt, grouped by impulse class and certification level under `<optgroup>`
headings. The default motor stays **C6**.

### Data source and format

The `.eng` files use the **RASP format**, the de-facto open standard shared by
RASP, OpenRocket, RockSim, and the **ThrustCurve.org** open motor dataset. See
the format spec at https://www.thrustcurve.org/info/raspformat.html. A `.eng`
file looks like this:

```
; comment lines start with a semicolon
H128W 29 124 6-10-14 0.0620 0.1510 AeroTech
0.03 90.0
0.15 160.0
...
1.27 40.0
1.30 0.0
```

The first non-comment line is the header:
`name diameter(mm) length(mm) delays propellantMass(kg) totalMass(kg) manufacturer`.
Every following line is a `time(s) thrust(N)` pair, ending when thrust returns to
0 (burnout). `js/eng.js` parses this, integrates the curve with the trapezoidal
rule to recover **total impulse (N.s)**, and derives average thrust, burn time,
and the **NAR letter class** (A, B, C, ... where each letter is a factor-of-two
impulse band). The flight model (`thrustAt` / `motorMassAt` in `js/motors.js`)
linearly interpolates the real curve and burns propellant in proportion to
delivered impulse. Legacy presets with no curve keep using the boxcar model, so
both kinds fly through the same simulator unchanged.

### Certification levels (L1 / L2)

Motors are grouped by the NAR / Tripoli high-power certification tiers:

- **Model** (A to G): no HPR certification required.
- **L1 / Level 1** (H to I): first high-power tier.
- **L2 / Level 2** (J to L): second high-power tier.
- **L3 / Level 3** (M and up).

### Important: the shipped curves are transcribed / approximate

This project was assembled in an **offline sandbox with no internet access**, so
the exact official curves could not be fetched live. The `.eng` files under
`data/motors/` contain thrust curves **transcribed from published manufacturer
and ThrustCurve.org data** into reasonable, physically consistent shapes whose
integrated impulse lands inside the motor's advertised class band. They are
accurate enough to demonstrate the loader and to fly realistically, but for
competition-grade numbers you should drop in the **official `.eng` files**.

### Adding more motors (drop in official ThrustCurve.org data)

1. Download the official `.eng` file for a motor from
   https://www.thrustcurve.org (each motor page has a "Download" link with the
   RASP `.eng` data).
2. Save it into `data/motors/` (keep the `Manufacturer_Code.eng` naming style).
3. Register it by adding the filename to the `ENG_FILES` array in
   `js/motors.js`. That is the only code change needed; the loader fetches and
   parses it, and the dropdown picks it up grouped under its class.

No build step is involved: files are fetched directly in the browser at load.

---

## 3D viewer

The Builder's center panel has a **2D / 3D** toggle above the drawing. Switch to
**3D** for an interactive, rotatable view of the rocket, built as a true surface
of revolution from the same component model the 2D view and the physics engine
use. The nose is revolved from `noseConeProfile()` (so every nose shape family
renders correctly), body tubes and transitions become cylinders and frustums,
and fins are extruded and placed evenly around the body.

Controls (orbit camera):

- **Rotate:** left-click and drag.
- **Zoom:** scroll wheel (or pinch on a trackpad).
- **Pan:** right-click and drag.

The 3D view is powered by **Three.js**, loaded at runtime from a CDN as an ES
module (pinned to `three@0.160.0`) via the importmap in `index.html`. That means
the 3D view needs **internet access** the first time it loads Three.js. The 2D
Canvas view has no external dependency and keeps working fully offline, so the
app stays usable as a fallback even without a connection. The 3D renderer and
its animation loop start lazily only when you first switch to 3D, and the loop
pauses whenever the 3D view is hidden.

---

## Validation

The default rocket (50 cm, 108.05 g loaded) on a **C6** motor simulates to ~185.7 m apogee,
Mach 0.20, ~0.99 caliber stability. These are approximate regression values; the
starter is marginal near one caliber. See the numerical correction record.

Headless smoke tests cover the logic (run from the repo root with Node):

```bash
node scripts/smoke.mjs           # baseline: CG/CP/stability/apogee finite
node scripts/smoke-analysis.mjs  # depth metrics finite, explanations + citations
                                 # present, mass breakdown sums to 100%, apogee
                                 # within 2% of the corrected 185.7 m baseline
node scripts/smoke-motors.mjs    # .eng parse: integrated impulse matches class,
                                 # curve monotonic, thrustAt interpolation 0
                                 # outside the burn, and a curve-based H/I motor
                                 # flies higher than the C6 baseline
node scripts/smoke-onshape.mjs   # Onshape scaffolding: parametric geometry
                                 # invariants, non-empty FeatureScript builders,
                                 # and the client seam makes no network call
```

---

## Onshape integration (scaffolding)

The longer-term goal is an AI-assisted rocketry CAD extension that generates
**parametric rocket parts inside Onshape**, using RocketLab's physics as the
"rocket brain". This first slice is **scaffolding only**: the pieces that need
no live API are implemented now, and there is a clean, documented seam where the
authenticated Onshape REST call plugs in later.

### What is implemented now

- **Parametric geometry math** in `js/onshape/geometry.js`. Pure, DOM-free, and
  network-free functions turn a RocketLab component into a CAD-ready
  revolve/extrude definition:
  - **Nose** reuses `noseConeProfile()` from `rocket.js` and returns the
    `[{x, r}]` profile, the revolve axis, wall thickness, and a `shellInward`
    flag so every nose shape family revolves into the correct hollow solid.
  - **Body tube** returns outer diameter, inner diameter (derived from the wall
    thickness, always less than the outer), length, a 4-corner revolve profile,
    and an extrude alternative.
  - **Transition** returns the front/rear diameters, length, and the straight
    outer profile that revolves into the frustum.
  - **Fins** return the 4-point trapezoid (from root chord, tip chord, span, and
    sweep), the extrude thickness, the count, and a radial pattern whose angle is
    `360 / count` degrees.
  - All values are in **meters**, which is convenient because Onshape
    FeatureScript uses meters as its internal base length unit.
- **FeatureScript / parameter builders** in `js/onshape/featurescript.js`. Pure
  string and JSON builders that produce, for each part family, a FeatureScript
  source string plus a parameter payload object. A later API call just POSTs
  these; no geometry math happens at request time.
- **The client seam** in `js/onshape/client.js`: an `OnshapeClient` class with
  `createDocument()`, `createPartStudioFeature()`, and `exportRocket()`. Its
  transport (the thing that performs HTTP) is **injectable via the constructor**.
  With no transport it makes **no network call** and throws a clear
  `OnshapeNotConfiguredError` ("Onshape API not yet configured"). Swapping in a
  real transport later is the only change needed to go live.
- **A Builder preview** ("Onshape (coming soon)" button) that shows the generated
  parametric part definitions (FeatureScript + parameters) so the pipeline is
  demoable **without a live API**. It makes no network call and cannot break the
  app if clicked.
- **A headless gate**, `scripts/smoke-onshape.mjs`, asserting the geometry
  invariants (monotonic nose profile starting at r ~ 0 and ending at r = R,
  body inner diameter less than outer, fin trapezoid with 4 points, radial angle
  `360 / count`), non-empty builder output, and that the client makes no network
  call.

### What is intentionally deferred (until API keys work)

- **Live REST calls** to Onshape (creating documents, pushing Part Studio
  features). The code paths exist in `js/onshape/client.js` but refuse to run
  until a transport is injected.

### Known constraints to plan for

- **New-account API-key delay.** A brand-new personal Onshape account cannot
  create API keys for a while (anti-abuse). This is the current blocker: the
  math and the seam are ready, but there is no key to authenticate with yet.
  Testing on an older, already-eligible account is a reasonable way to unblock.
- **Free accounts make every document public.** Anything created through this
  pipeline on a free Onshape account is world-readable. `createDocument()` is
  explicit about this.
- **Secrets cannot live in client-side JS.** Onshape authenticates with an API
  key plus a secret (HMAC request signing or an OAuth client secret). A secret
  must never ship in browser JavaScript, so a later phase needs a **tiny local
  signing/proxy server** (for example a small Node service on the user's own
  machine) that holds the secret, signs each request, and forwards it to
  Onshape. The browser talks only to that local server.

### Where the seam is

`js/onshape/client.js` is the single place the live request plugs in. Point its
`baseUrl` at the local signing/proxy server and pass a `transport` function to
`new OnshapeClient({ transport, baseUrl })`; the existing method bodies then send
real requests with no further changes. Run `node scripts/smoke-onshape.mjs` to
confirm the scaffolding stays correct and network-free.

---

## Ideas to extend (Tier 2 / stretch)

- Expand the **`.eng` motor catalog** with more official ThrustCurve.org files
  (drop them into `data/motors/` and register them in `ENG_FILES`).
- **Save/load** rocket designs as JSON.
- **Wind** and off-vertical launch (2D downrange flight).
- Airfoil **fin cross-sections** and transonic drag rise.
- An **engine designer** tab (chamber pressure → thrust) feeding the flight sim.
```
```


## RocketLab 2.0 development milestones

The standalone app still runs from a static HTTP server with no Node runtime,
package manager, or build step. Node is used only for development checks.

### Projects

Use **Save JSON** in the Builder to download a versioned RocketLab project.
Use **Load JSON** to reopen it. Files preserve the project name, motor ID, and
all current component dimensions, materials, and nose shape parameters. Imported
components receive fresh internal IDs. A successful import clears the previous
flight results; launch again to simulate the imported design.

Imports reject malformed files, unsupported versions, unknown components or
materials, invalid dimensions, unavailable motors, and files larger than 50 MB.
Wait for the local motor catalog to load before importing a curve-motor project.
The current simulator has fixed UI settings; configurable simulation settings,
custom motor embedding, and external CAD geometry are not part of version 1;
version 2 additionally retains imported CAD source, properties, placement, and metadata.

### Reliability

Three.js is imported only when requesting 3D. CDN or WebGL failures leave the
2D builder usable. Flight playback ignores repeated Play clicks and cancels
pending animation callbacks when loading another result.

Additional framework-free checks:

```bash
node scripts/smoke-ui.mjs
node scripts/smoke-project.mjs
```

All four original smoke tests and both additional tests pass on Node v24.22.1.
Headless Chrome startup was verified with the Three.js CDN blocked: the Builder,
analysis panel, local motor catalog, and project controls initialized successfully.
Interactive 3D rendering and native file-picker/download interactions still need
manual browser verification.

The original 166.2 m C6 baseline was preserved by those UI/project milestones.
Subsequent confirmed numerical corrections changed it to ~185.7 m; see
[the correction record](docs/NUMERICS.md) for mass accounting, launch support,
fin centroid, CP aliases, burnout quadrature, and regression evidence. Fin-can solids, CAD kernel
integration, and STEP interoperability remain planned.

### Flight plots

The Flight panel now offers altitude, signed vertical velocity, net vertical
acceleration, motor thrust, and static stability during the motor burn. The
chart includes units, a zero line, and a method/assumption note. Stability uses
six burn-time samples and does not represent attitude dynamics. Acceleration is
recorded from the existing force calculation without changing the integrator.
Run `node scripts/smoke-plots.mjs` to validate chart data and ranges.

### Integrated fin can and solid CAD

Add **Fin can** to replace separate tail fins with an inline hollow sleeve and
attached fins. Edit its diameters, length, fin geometry/count/thickness, and
material. Mass/CG, stability, reference area, drag estimate, and JSON projects
include the new component without adding a duplicate aerodynamic fin set.

Select a body tube or fin can and expand **Solid CAD · STEP / STL**. Generate a
real OpenCascade B-rep solid, inspect its tessellation, and download STEP, STL,
or parameter/material metadata. Exported STEP is reopened and validated before
download. STEP import supports geometric inspection (volume, centroid, bounds, solid count
and preview), with an explicit assembly and aerodynamic-role workflow described below.

See [CAD workflows, tests, assumptions and deployment audit](docs/CAD.md) and
[third-party notices](THIRD_PARTY.md). Run `node scripts/check.mjs` for all twelve
smoke tests and syntax checks. Real-kernel and Chrome integration checks are
available separately and documented there. The website still needs no build
step, npm installation, Node runtime, or backend.


### Persistent development and imported CAD assemblies

Start future development from [AGENTS.md](AGENTS.md) and
[DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).

Inspected STEP parts can now replace a selected part or be added explicitly.
Choose an internal mass-only role or supply an external cylindrical proxy;
material/density, position, rotation, actual source geometry and properties are
retained in version-2 JSON projects. New companion metadata uses source
fingerprints and a regeneration check before restoring original parametric
body/fin-can parts. Details and limitations are in [docs/CAD.md](docs/CAD.md).
Run `node scripts/check.mjs` for all twelve smoke tests and syntax checks.


**Centering rings** are now available as internal manufacturing parts with exact
annular mass/CG, placement, editable dimensions/material, 3D display, JSON
persistence, and solid STEP/STL/metadata export. They add no exterior aerodynamics.


Static reference cases have now been executed in installed OpenRocket 24.12.
CP and fin centroid agree closely for the two tested geometries; structure
mass/CG and drag differences remain documented. Full flight equivalence is not
yet verified. See [OpenRocket validation](docs/OPENROCKET_VALIDATION.md).
Publication is prepared but inactive: [deployment instructions](docs/DEPLOYMENT.md).


### Part Studio and constrained Assembly

Open a selected component in **Part Studio** for isolated 3D and shared parameter
editing. Assembly uses the same part; changes update engineering and invalidate
old flight/CAD results. New noses and fin cans match the current body through
persistent relationships, including after deletion/recreation. Automatic,
manual, and locked diameter sizing and manufacturing clearances are explicit.

Duplicate/import reusable parts into the project library, then choose whether
they are assembled. Native v3 stores stable identities and relationships; older
projects remain loadable. Visibility and exploded display do not change physics.
CG/CP 3D rings and labels are toggleable. See [workspace workflows and limits](docs/WORKSPACES.md).


New manufacturing noses include an optional body-fitted hollow/solid shoulder,
join web, geometry-consistent mass/CG, and STEP/STL/metadata export. Legacy noses
remain unchanged until switched to the manufacturing model. Curved profiles use
48 axial samples; see [CAD assumptions and verification](docs/CAD.md).


Fin cans now support signed axial fin offsets and forward/aft overhang. Complete
fin plates remain joined through a validated supported root interval. Mass/CG,
CP, overall display bounds, and STEP/STL exports follow the same geometry;
disconnected roots are rejected. See [CAD details](docs/CAD.md).
