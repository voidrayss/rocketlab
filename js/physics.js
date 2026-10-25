// ===========================================================================
// physics.js — the flight simulator (numerical integration of the EOM).
//
// We integrate a point-mass 2D flight (vertical ascent + descent) with:
//   - thrust (from the motor, while burning)
//   - gravity
//   - aerodynamic drag  (F = 0.5 * rho * v^2 * Cd * A)
//   - variable mass (motor propellant burns off)
//   - optional parachute deployment at apogee (big Cd jump)
//
// Integration uses classic RK4 — more accurate than Euler for the same step.
// ===========================================================================

import { thrustAt, motorMassAt } from "./motors.js";
// Circular import with aero.js (it imports `atmosphere` from here). Safe ONLY
// because every use of massProperties/centerOfPressure below is lazy (inside a
// function body), never at module top level. Do not call these while this
// module is initializing or the cycle will read an undefined binding.
import { massProperties, centerOfPressure } from "./aero.js";
import { maxBodyDiameter, bodyLength, totalLength } from "./rocket.js";

const G = 9.80665;          // gravity (m/s^2)

// ---------------------------------------------------------------------------
// International Standard Atmosphere (ISA) troposphere model (0 to 11 km).
// This is the same model OpenRocket and aerospace texts use for low altitude.
//   T   = 288.15 - 0.0065 * h          (temperature, K)
//   p   = 101325 * (T / 288.15)^5.2559 (pressure, Pa)
//   rho = p / (287.05 * T)             (density, kg/m^3, ideal gas)
//   a   = sqrt(1.4 * 287.05 * T)       (speed of sound, m/s)
// Reference: U.S. Standard Atmosphere, 1976 / ISO 2533.
// ---------------------------------------------------------------------------
const T0 = 288.15;          // sea-level temperature (K)
const P0 = 101325;          // sea-level pressure (Pa)
const LAPSE = 0.0065;       // tropospheric lapse rate (K/m)
const R_AIR = 287.05;       // specific gas constant for dry air (J/kg/K)
const GAMMA = 1.4;          // ratio of specific heats for air

export function atmosphere(altitude) {
  const h = Math.max(0, altitude);
  const temperature = T0 - LAPSE * h;
  const pressure = P0 * Math.pow(temperature / T0, 5.2559);
  const density = pressure / (R_AIR * temperature);
  const speedOfSound = Math.sqrt(GAMMA * R_AIR * temperature);
  return { density, pressure, temperature, speedOfSound };
}

// Air density (kg/m^3) at altitude, from the ISA model.
function airDensity(altitude) {
  return atmosphere(altitude).density;
}

// Speed of sound (m/s) at altitude, from the ISA model.
function speedOfSound(altitude) {
  return atmosphere(altitude).speedOfSound;
}

// Compute the derivative of the state. State = { y (altitude), v (velocity) }.
// Positive v = moving up. Mass & thrust come from the motor at time t.
function derivative(state, t, ctx) {
  const { motor, dryMass, Cd, area, parachute } = ctx;

  const motorMass = motorMassAt(motor, t);
  const mass = dryMass + motorMass;

  const rho = airDensity(state.y);

  // Forces (up = positive).
  let force = 0;

  // Thrust (always up along the flight path during ascent in this 1D model).
  const thrust = ctx.thrustOverride ?? thrustAt(motor, t);
  force += thrust;

  // Gravity.
  force -= mass * G;

  // Drag opposes velocity.
  const v = state.v;
  const speed = Math.abs(v);
  let cd = Cd;
  let a = area;
  if (parachute.deployed) {
    cd = parachute.Cd;
    a = parachute.area;
  }
  const dragMag = 0.5 * rho * speed * speed * cd * a;
  force -= Math.sign(v) * dragMag;

  // The launch pad supports the rocket until thrust overcomes weight.
  const supported = ctx.onPad && state.y <= 0 && state.v <= 0 && force <= 0;
  const accel = supported ? 0 : force / mass;
  const vSound = speedOfSound(state.y);
  return { dy: supported ? 0 : v, dv: accel, mass, thrust, rho, mach: speed / vSound, accel };
}

// One RK4 step. Returns the new state plus some telemetry from the midpoint.
function rk4Step(state, t, dt, ctx) {
  // Boxcar thrust is constant on this interval. Steps are split at burnout,
  // so RK4 must use the pre-burnout value at the interval's right endpoint.
  if (!ctx.motor.curve) ctx = {...ctx, thrustOverride: t < ctx.motor.burnTime ? ctx.motor.avgThrust : 0};
  const k1 = derivative(state, t, ctx);
  const s2 = { y: state.y + k1.dy * dt / 2, v: state.v + k1.dv * dt / 2 };
  const k2 = derivative(s2, t + dt / 2, ctx);
  const s3 = { y: state.y + k2.dy * dt / 2, v: state.v + k2.dv * dt / 2 };
  const k3 = derivative(s3, t + dt / 2, ctx);
  const s4 = { y: state.y + k3.dy * dt, v: state.v + k3.dv * dt };
  const k4 = derivative(s4, t + dt, ctx);

  const y = state.y + (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy);
  const v = state.v + (dt / 6) * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv);
  return { state: { y, v }, telem: k1 };
}

// ---------------------------------------------------------------------------
// Run a full flight simulation and return the whole trajectory as an array of
// samples. Used both for the animation and for computing headline stats.
// ---------------------------------------------------------------------------
export function simulateFlight({ motor, dryMass, Cd, area,
                                 useParachute = true, parachuteCd = 1.5,
                                 parachuteArea = 0.5, dt = 0.01, tMax = 120,
                                 railLength = 1.0, rocket = null, motorX = null }) {
  // dryMass means all non-motor mass; loaded and spent casing are both in motorMassAt.
  for (const [name, value] of Object.entries({dryMass,Cd,area,dt,tMax,railLength,parachuteCd,parachuteArea})) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid simulation ${name}.`);
  }
  if (dt <= 0 || tMax <= 0 || tMax / dt > 2000000 || area <= 0 || railLength <= 0 || (useParachute && (parachuteArea <= 0 || parachuteCd <= 0))) throw new Error("Invalid simulation step, duration or geometry.");
  if (!motor || ![motor.totalMass,motor.propellantMass,motor.burnTime,motor.avgThrust].every(Number.isFinite) || motor.totalMass <= 0 || motor.propellantMass < 0 || motor.propellantMass > motor.totalMass || motor.burnTime <= 0 || motor.avgThrust < 0) throw new Error("Invalid simulation motor.");
  const ctx = {
    motor, dryMass, Cd, area, onPad: true,
    parachute: { deployed: false, Cd: parachuteCd, area: parachuteArea },
  };

  let state = { y: 0, v: 0 };
  let t = 0;

  const samples = [];
  let apogee = 0, apogeeTime = 0, maxV = 0, maxMach = 0;
  let maxQ = 0, maxQTime = 0;        // peak dynamic pressure (Pa)
  let maxAccel = 0;                  // peak |acceleration| during ascent (m/s^2)
  let railExitVelocity = null;          // velocity when the rocket clears the rail
  let railCleared = false;
  let launched = false;

  while (t <= tMax) {
    if (state.y > 0) { launched = true; ctx.onPad = false; }
    const { mass, thrust, mach, rho, accel } = derivative(state, t, ctx);
    const speed = Math.abs(state.v);

    samples.push({
      t, y: Math.max(0, state.y), v: state.v, speed,
      mass, thrust, mach, accel,
      parachute: ctx.parachute.deployed,
    });

    if (state.y > apogee) { apogee = state.y; apogeeTime = t; }
    if (speed > maxV) maxV = speed;
    if (mach > maxMach) maxMach = mach;

    // Dynamic pressure q = 0.5 * rho * v^2 (drives aero loads).
    const q = 0.5 * rho * speed * speed;
    if (q > maxQ) { maxQ = q; maxQTime = t; }

    // Peak acceleration magnitude while still going up (thrust phase).
    if (state.v >= 0 && Math.abs(accel) > maxAccel) maxAccel = Math.abs(accel);

    // Record velocity as the rocket clears the launch rail.
    if (!railCleared && state.y >= railLength) {
      railExitVelocity = state.v;
      railCleared = true;
    }

    // Deploy parachute right after apogee (velocity turns negative).
    if (useParachute && !ctx.parachute.deployed && launched && state.v < 0) {
      ctx.parachute.deployed = true;
    }
    if (!launched && t >= motor.burnTime && state.y <= 0 && state.v <= 0) break;

    // Landed: we've flown and come back to the ground moving downward.
    if (launched && state.y <= 0 && state.v < 0) break;

    if (t >= tMax) break;
    const stepDt = Math.min(dt, tMax - t, motor.burnTime > t ? motor.burnTime - t : dt);
    const step = rk4Step(state, t, stepDt, ctx);
    state = step.state;
    if (!launched && state.y < 0) state = { y: 0, v: 0 };
    t += stepDt;
  }

  // A rocket that never clears the rail has no rail-exit velocity.

  // Thrust-to-weight ratio at liftoff: average thrust / initial weight. We use
  // average (not peak) thrust so the ratio reflects the sustained lift over the
  // boost, which is the figure the >=5 rule of thumb is stated against. The
  // analysis.js explanation and citation describe this same average basis.
  const liftoffMass = dryMass + motorMassAt(motor, 0);
  const thrustToWeight = motor.avgThrust / (liftoffMass * G);

  // Steady descent rate under the parachute: from the last descending samples
  // (an approximate terminal speed). We take the mean of the
  // latter half of descent speeds to smooth out numerical wiggle.
  const descentRate = computeDescentRate(samples);

  // Stability margin over the burn: the CG shifts forward as the (rear-mounted)
  // propellant burns off, so the caliber margin changes during the thrust
  // phase. We sample a handful of points from ignition to burnout.
  const stabilityVsTime = computeStabilityVsTime(rocket, motor, motorX);

  return {
    samples,
    stats: {
      apogee, apogeeTime, maxV, maxMach,
      flightTime: t,
      burnoutTime: motor.burnTime,
      thrustToWeight,
      railExitVelocity,
      railLength, launched, railCleared,
      termination: !launched ? "no-liftoff" : (state.y <= 0 && state.v < 0 ? "landed" : "time-limit"),
      maxQ, maxQTime,
      maxAcceleration: maxAccel / G,   // reported in g's
      descentRate,
      stabilityVsTime,
    },
  };
}

// Sample caliber stability margin across the motor burn. Returns [] when no
// rocket model is supplied (e.g. a bare physics-only call).
function computeStabilityVsTime(rocket, motor, motorX) {
  if (!rocket) return [];
  const { cp } = centerOfPressure(rocket);
  const dRef = maxBodyDiameter(rocket);
  // Default the motor position to the tail (~5 cm ahead of the aft end), which
  // is where builder.js / main.js / analysis.js actually place it. A bare
  // simulateFlight call that passes `rocket` but omits `motorX` would otherwise
  // put the motor at the nose tip (x=0) and skew the stability curve.
  const mx = motorX ?? Math.max(0, bodyLength(rocket) - 0.05);
  const nSamples = 6;
  const out = [];
  for (let i = 0; i < nSamples; i++) {
    const tb = (motor.burnTime * i) / (nSamples - 1);
    const mMass = motorMassAt(motor, tb);
    const { cg } = massProperties(rocket, mMass, mx);
    out.push({ t: tb, calibers: (cp - cg) / dRef });
  }
  return out;
}

// Steady descent rate: average downward speed over the latter part of the
// descent, once the parachute is fully doing its job.
function computeDescentRate(samples) {
  const descending = samples.filter(s => s.parachute && s.v < 0 && s.y > 0);
  if (descending.length === 0) return 0;
  const tail = descending.slice(Math.floor(descending.length / 2));
  const sum = tail.reduce((acc, s) => acc + Math.abs(s.v), 0);
  return sum / tail.length;
}
