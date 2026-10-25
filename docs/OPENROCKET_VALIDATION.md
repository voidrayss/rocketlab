# OpenRocket reference comparisons — 2026-10-25

## What was actually run

The installed OpenRocket 24.12 JAR was invoked headlessly through its public
core API, using its bundled Java 17 runtime. The RocketLab-authored reflective
benchmark driver is `scripts/reference/Reference.java`. A local JDK 11 compiles
that standalone driver; no OpenRocket implementation, JAR, or Java runtime is
included in the website. This is a separate development process, not a replacement
engine. Reproduce with:

```bash
node scripts/openrocket-reference.mjs
```

Override OPENROCKET_JAR, OPENROCKET_JAVA, or JAVAC when installed elsewhere. The
runner writes compiler output, preferences, and results to a temporary directory.
It records the installed JAR hash. Frozen actual measurements and all dimensions
are in `data/reference/openrocket-24.12.json`; offline comparisons run via
`node scripts/smoke-reference.mjs` or the full `scripts/check.mjs` suite.

## Matched geometry and conditions

Two nose variants: conical and tangent ogive (shape parameter 1). Nose length
0.15 m, radius 0.025 m, wall 0.002 m, no shoulder; body length 0.35 m, radius
0.025 m, wall 0.001 m. Three square-section trapezoidal fins: root 0.08 m, tip
0.04 m, span 0.05 m, sweep 0.04 m, thickness 0.003 m, no fillets. Nose starts
at x=0, body at x=0.15, fin roots at x=0.42. Both measure nose-to-tail.
Densities: plastic 1200, cardboard 680, plywood 600 kg/m³. No motor or recovery
system is installed in these static structure cases. OpenRocket conditions are
Mach 0.1, zero AoA, 288.15 K, 101325 Pa, regular painted finish (60 µm).
RocketLab uses its existing fixed empirical Cd rather than a roughness/Reynolds
or Mach-sensitive drag calculation.

| Quantity | RocketLab conical | OpenRocket conical | RocketLab ogive | OpenRocket ogive |
| --- | ---: | ---: | ---: | ---: |
| CP from nose (mm) | 373.251 | 373.298 | 366.454 | 366.365 |
| Structure mass (g) | 82.249 | 79.240 | 82.249 | 88.848 |
| Structure CG from nose (mm) | 274.927 | 280.104 | 274.927 | 257.736 |
| Fin local axial centroid (mm) | 48.889 | 48.889 | 48.889 | 48.889 |
| Cd | 0.460 | 0.526 | 0.400 | 0.517 |

CP differs by −0.047 mm / +0.089 mm for these cases, and the corrected fin
centroid agrees to floating-point precision. A 0.2 mm CP comparison gate allows
the existing incompressible/truncated RocketLab factors and OpenRocket's subsonic
corrections. This narrow agreement does not validate arbitrary rockets or Mach ranges.

Mass/CG differences are substantive and remain visible. RocketLab currently
masses every nose as a thin conical shell with centroid 2L/3; OpenRocket's
shape-aware hollow cone/ogive gives different mass and centroid. RocketLab's
thin tube approximation also differs from OpenRocket's finite annular volume.
Fin mass agrees at 16.2 g. This motivates future shape-aware mass refinement,
not an arbitrary rescaling to match one reference. Drag differs because the
models and surface-finish treatment differ. Neither Cd is treated as measured
wind-tunnel truth by this comparison.

## Still unverified

No equivalent complete motor/recovery flight was run in OpenRocket. Apogee,
max velocity/acceleration, flight duration, and dynamically loaded stability
have not yet been compared. Next: create a motor-matched case using exactly the
same thrust samples/mass history, zero wind, vertical launch, matched recovery,
launch-site atmosphere, rail and timestep settings; then compare event histories
and separate drag-model differences from numerical integration differences.
Current RocketLab trajectory tests use an independent analytic zero-drag case
and regression values, not an OpenRocket flight-equivalence assertion.

## Sources and license review

OpenRocket 24.12 is GPL-3.0-or-later with its documented data-packaging permission.
No implementation source was copied or adapted into RocketLab. The separate
benchmark driver only calls the locally installed program's public API.

- [OpenRocket release license](https://github.com/openrocket/openrocket/blob/release-24.12/LICENSE.TXT)
- [OpenRocket core integration documentation](https://openrocket.readthedocs.io/en/latest/dev_guide/using_openrocket_core.html)
- [Release Barrowman calculator](https://github.com/openrocket/openrocket/blob/release-24.12/core/src/main/java/info/openrocket/core/aerodynamics/BarrowmanCalculator.java)

The release sources informed API inspection only; calculations reported above
came from executing the installed program. Review licensing separately before
any future incorporation or redistribution of OpenRocket implementation code.
