# Numerical correction record — 2026-10-25

Corrections preserve the existing mass model, Barrowman method, and RK4 scheme.
The initial 166.2 m C6 baseline is historical and contained a confirmed mass bug.

## Evidence and changes

- **Motor counted twice:** original non-motor structure is 82.2493 g, loaded
  C6 motor 25.8 g, spent casing 15 g. Callers supplied 97.2493 g as dryMass,
  and the integrator added the full motor again: 123.0493 g. Callers now supply
  structure only, so liftoff is 108.0493 g and burnout mass is 97.2493 g. Report
  mass and trajectory telemetry agree. No motor data was altered.
- **Boxcar burnout quadrature:** a step that crosses the discontinuous thrust
  cutoff can over/under-deliver impulse. Integration steps now end at burnout;
  boxcar thrust is constant over the powered interval, with zero thrust from
  burnout onward. RK4 itself is unchanged. A constant-mass zero-drag reference
  has powered acceleration a=T/m−g, burnout altitude a*tb²/2 and velocity a*tb;
  coast apogee adds v²/(2g). Steps 0.1, 0.03, and 0.01 s agree with this exact
  result within 0.02 m. Curve integration/interpolation remains supported.
- **Launch pad:** initial zero or insufficient thrust previously let the state
  fall below ground, sometimes terminating before the curve reached useful
  thrust. The pad now supplies the support force while at rest until thrust
  exceeds weight. Only actual positive altitude marks liftoff. A weak motor
  reports no-liftoff, no rail-exit velocity, and no parachute deployment. A
  delayed/ramping motor remains on the pad before lifting off.
- **Rail not cleared:** no longer reports peak speed as a fabricated exit speed.
  The value is null, displayed as “Not cleared,” with a separate railCleared flag.
- **Transition CP singularity:** (1−df/dr)/(1−(df/dr)²) simplifies to dr/(df+dr).
  Using the reduced form gives a finite midpoint at equal diameters; the normal
  force contribution is correctly zero. Equal-diameter transitions can now be
  loaded as projects without rejection solely for this old singularity.
- **Separate fin centroid:** rootChord/2 is wrong for swept/tapered plates.
  Integrating x over the trapezoidal area gives
  [sweep*(cr+2ct)+cr²+cr*ct+ct²]/[3*(cr+ct)]. The same expression is used for
  separate fins and integrated fin-can panels. Volume/mass remain unchanged.
- **Nose shape consistency:** conical/cone aliases now share the same CP rule.
  The 2D canvas uses the shared nose profile generator, as the 3D view does.
  CP for other nose families still uses the existing ogive approximation.
- **Curve endpoint and malformed data:** a curve explicitly starting at t=0
  with nonzero thrust now returns that value. RASP parsing rejects invalid
  masses/dimensions, negative/nonfinite samples, duplicate times, malformed
  records, zero duration/impulse, and nonzero final thrust. All 12 shipped
  single-motor files parse. Multi-motor RASP bundles are not supported.
- **Input bounds:** invalid integration steps, durations, mass/geometry, and
  motors fail before integration, avoiding hangs and nonfinite propagation.

## Corrected reference and limits

Default C6: apogee ~185.7 m, max speed ~68.5 m/s, Mach ~0.201, liftoff mass
108.05 g. CG ~31.67 cm and stability ~0.99 calibers after the fin-centroid fix.
These are internal regression values, not an OpenRocket or flight-test match.
The analysis apogee gate is now within 2% of 185.7 m, with separate analytic
mass and trajectory references. `scripts/smoke-numerics.mjs` documents the tests.

Remaining accuracy work includes shape-aware nose mass/CP, non-thin-shell tube
mass outside fin cans, atmosphere above the documented troposphere, exact
apogee/rail/touchdown event interpolation, real certified motor curves,
wind/attitude/transonic modeling, and OpenRocket reference comparisons.
