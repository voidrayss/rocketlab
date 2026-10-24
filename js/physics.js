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

const G = 9.80665;          // gravity (m/s^2)
const RHO0 = 1.225;         // air density at sea level (kg/m^3)
const SCALE_HEIGHT = 8500;  // for a simple exponential atmosphere (m)

// Simple exponential atmosphere so drag drops with altitude.
function airDensity(altitude) {
  if (altitude < 0) return RHO0;
  return RHO0 * Math.exp(-altitude / SCALE_HEIGHT);
}

// Speed of sound (m/s) — roughly constant for low-altitude hobby flights.
const SPEED_OF_SOUND = 343;

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
  const thrust = thrustAt(motor, t);
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

  const accel = force / mass;
  return { dy: v, dv: accel, mass, thrust, rho, mach: speed / SPEED_OF_SOUND };
}

// One RK4 step. Returns the new state plus some telemetry from the midpoint.
function rk4Step(state, t, dt, ctx) {
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
                                 parachuteArea = 0.5, dt = 0.01, tMax = 120 }) {
  const ctx = {
    motor, dryMass, Cd, area,
    parachute: { deployed: false, Cd: parachuteCd, area: parachuteArea },
  };

  let state = { y: 0, v: 0 };
  let t = 0;

  const samples = [];
  let apogee = 0, apogeeTime = 0, maxV = 0, maxMach = 0;
  let launched = false;

  while (t <= tMax) {
    const { mass, thrust, mach } = derivative(state, t, ctx);
    const speed = Math.abs(state.v);

    samples.push({
      t, y: Math.max(0, state.y), v: state.v, speed,
      mass, thrust, mach,
      parachute: ctx.parachute.deployed,
    });

    if (state.y > apogee) { apogee = state.y; apogeeTime = t; }
    if (speed > maxV) maxV = speed;
    if (mach > maxMach) maxMach = mach;

    // Deploy parachute right after apogee (velocity turns negative).
    if (useParachute && !ctx.parachute.deployed && launched && state.v < 0) {
      ctx.parachute.deployed = true;
    }
    if (state.v > 0.1 || thrust > 0) launched = true;

    // Landed: we've flown and come back to the ground moving downward.
    if (launched && state.y <= 0 && state.v < 0) break;

    const step = rk4Step(state, t, dt, ctx);
    state = step.state;
    t += dt;
  }

  return {
    samples,
    stats: {
      apogee, apogeeTime, maxV, maxMach,
      flightTime: t,
      burnoutTime: motor.burnTime,
    },
  };
}
