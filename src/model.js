// -----------------------------------------------------------------------------
// What the raw values of a read mean (pure): plausibility ranges, signs, the
// codes of the modes. A value outside its plausible range is unknown, never
// published; a lifetime counter at 0 is unknown (a counter that does not
// count, never a measure of 0).
//
// Signs (manufacturer's README): battery power > 0 discharges, < 0 charges.
// The sign of the AC power (39134) is not documented: published as is, as a
// signed sensor (TODO.md).
// -----------------------------------------------------------------------------

import { CONTROL_MODES, EPS_MODES, ROLE as R } from './constants.js';

const within = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;

const round = (value, digits = 0) => {
  if (value === undefined) return undefined;
  const f = 10 ** digits;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

/** A power that is >= 0 by nature: small negatives (idle noise) read as 0. */
const positive = (value, max) => {
  const v = within(value, -100, max);
  return v === undefined ? undefined : Math.max(0, round(v));
};

/** A serial number Gladys keys the device on: letters, digits, - and _, 4 to 40. */
export function serialOf(text) {
  return typeof text === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(text)
    ? text.toUpperCase()
    : undefined;
}

/** The model name, printable and short, else undefined. */
export const modelOf = (text) =>
  typeof text === 'string' && /^[\x20-\x7e]{1,32}$/.test(text) ? text : undefined;

/**
 * Register 46001 -> 'auto' (remote control disabled: bit 0 clear), 'discharge'
 * (1), 'charge' (3), 'other' (another enabled code set by another tool), or
 * undefined (not a documented code: reserved bits 15:4 set).
 */
export function controlModeOf(code) {
  if (!Number.isInteger(code) || code < 0 || code > 15) return undefined;
  if ((code & 1) === 0) return 'auto';
  if (code === CONTROL_MODES.discharge) return 'discharge';
  if (code === CONTROL_MODES.charge) return 'charge';
  return 'other';
}

/** Whether a code of 46001 commands a discharge (enabled, generation): unknown counts as one. */
export function isDischargeCode(code) {
  if (!Number.isInteger(code) || code < 0 || code > 15) return true;
  return (code & 1) === 1 && (code & 2) === 0;
}

const epsModeOf = (code) => Object.keys(EPS_MODES).find((k) => EPS_MODES[k] === code);

/** A lifetime counter (kWh): > 0 and plausible, else unknown. */
const counter = (value) => {
  const v = within(value, 0.01, 1_000_000);
  return v === undefined ? undefined : round(v, 2);
};

/**
 * The values of a read, by key (the feature roles, plus `controlCode`, the
 * raw 46001, and the identity): only those known this time.
 */
export function interpret(raw) {
  const values = {};
  const put = (key, value) => {
    if (value !== undefined) values[key] = value;
  };
  put('serial', serialOf(raw.serial));
  put('model', modelOf(raw.model));
  const soc = within(raw.soc, 0, 100);
  put(R.BATTERY_LEVEL, soc === undefined ? undefined : round(soc));
  const battery = within(raw.batteryPower, -5000, 5000);
  if (battery !== undefined) {
    put(R.CHARGE_POWER, Math.max(0, round(-battery)));
    put(R.DISCHARGE_POWER, Math.max(0, round(battery)));
  }
  put(R.SOLAR_POWER, positive(raw.pvPower, 5000));
  put(R.AC_POWER, round(within(raw.acPower, -5000, 5000)));
  // 0 V: no grid (EPS), not a measure of the grid.
  put(R.AC_VOLTAGE, round(within(raw.acVoltage, 100, 300), 1));
  put(R.EPS_POWER, positive(raw.epsPower, 5000));
  put(R.TEMPERATURE, round(within(raw.temperature, -40, 100), 1));
  put(R.SOLAR_INDEX, counter(raw.pvEnergy));
  put(R.CHARGE_INDEX, counter(raw.chargeEnergy));
  put(R.DISCHARGE_INDEX, counter(raw.dischargeEnergy));
  put(R.AC_OUTPUT_INDEX, counter(raw.acExportEnergy));
  const mode = controlModeOf(raw.remoteControl);
  if (mode !== undefined) {
    put('controlCode', raw.remoteControl);
    put(R.CONTROL_MODE, mode);
  }
  const power = within(raw.remotePower, -100_000, 100_000);
  put(R.FORCE_POWER, power === undefined ? undefined : Math.abs(power));
  put('remotePower', within(raw.remotePower, -100_000, 100_000));
  put('remoteReactive', within(raw.remoteReactive, -100_000, 100_000));
  put('remoteTimeout', within(raw.remoteTimeout, 0, 0xffff));
  const countdown = within(raw.remoteCountdown, 0, 0xffff);
  put(R.FORCE_REMAINING, countdown === undefined ? undefined : round(countdown / 60, 1));
  put(R.MIN_SOC, within(raw.minSoc, 0, 100));
  put(R.MAX_SOC, within(raw.maxSoc, 0, 100));
  put(R.EPS_MODE, epsModeOf(raw.epsOutput));
  return values;
}
