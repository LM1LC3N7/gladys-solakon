// -----------------------------------------------------------------------------
// The Solakon ONE -> one Gladys device, its features, its commands and its
// states (pure).
//
// `ext:<selector>:solakon:<SERIAL>`: FROZEN RULE, the serial number read in
// registers 30016-30031 (letters, digits, - and _, 4 to 40, in upper case).
// Without a readable serial number nothing is published (a fallback id would
// make a second device the day the serial reads again). Another serial at the
// same address is another device. The feature roles (src/constants.js ROLE)
// are published forever: never rename them.
//
// Features built: the commands and the main states always; a sensor once a
// value of it was read (a firmware without the energy counters never shows
// them), or when the created device already has it (a republished device
// never loses a feature).
//
// No switch, no writable binary: a "turn everything off" never reaches the
// battery. The commands are `text/select` features (control mode, EPS
// output) and writable numbers (forced power, state of charge limits).
// Categories (core): battery-storage for the level, the charge and discharge
// powers (>= 0) and their indexes; energy-production-sensor for the solar
// power and index; home-output-sensor for the energy delivered on AC (index)
// and the EPS output power; the AC power, whose sign the manufacturer does
// not document, is a signed energy-sensor power (never home output, never
// grid); nothing is ever published as an `energy-sensor` energy or index.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { CONTROL_MODES, EPS_MODES, POWER, REG, ROLE as R, SOC_BOUNDS } from './constants.js';
import { CONTROL_MODE_NAMES, DEVICE_NAME, EPS_MODE_NAMES, FEATURE_NAMES, word } from './i18n.js';

export const SERVICE = 'solakon';

const sensor = (definition) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...definition,
});
const watts = (category, type, min = 0) => sensor({ category, type, unit: U.WATT, min, max: 5000 });
const kwh = (category, type) =>
  sensor({ category, type, unit: U.KILOWATT_HOUR, min: 0, max: 1_000_000 });
const select = {
  category: C.TEXT,
  type: T.TEXT.SELECT,
  min: 0,
  max: 0,
  read_only: false,
  has_feedback: true,
  keep_history: false,
};
// Gladys has no type for a power or state of charge setpoint: a writable number,
// its unit in its name (no unit: the core lists none for this category).
const setting = (min, max) => ({
  category: C.UNKNOWN,
  type: T.UNKNOWN.UNKNOWN,
  min,
  max,
  read_only: false,
  has_feedback: true,
  keep_history: true,
});

/** Every role in display order: [role, definition, always built]. */
const DEFINITIONS = [
  [
    R.BATTERY_LEVEL,
    sensor({
      category: C.BATTERY_STORAGE,
      type: T.BATTERY_STORAGE.BATTERY_LEVEL,
      unit: U.PERCENT,
      min: 0,
      max: 100,
    }),
    true,
  ],
  [R.CHARGE_POWER, watts(C.BATTERY_STORAGE, T.BATTERY_STORAGE.CHARGE_POWER), true],
  [R.DISCHARGE_POWER, watts(C.BATTERY_STORAGE, T.BATTERY_STORAGE.DISCHARGE_POWER), true],
  [R.SOLAR_POWER, watts(C.ENERGY_PRODUCTION_SENSOR, T.ENERGY_PRODUCTION_SENSOR.POWER), true],
  [R.AC_POWER, watts(C.ENERGY_SENSOR, T.ENERGY_SENSOR.POWER, -5000)],
  [R.EPS_POWER, watts(C.HOME_OUTPUT_SENSOR, T.HOME_OUTPUT_SENSOR.OFF_GRID_POWER)],
  [R.SOLAR_INDEX, kwh(C.ENERGY_PRODUCTION_SENSOR, T.ENERGY_PRODUCTION_SENSOR.INDEX)],
  [R.CHARGE_INDEX, kwh(C.BATTERY_STORAGE, T.BATTERY_STORAGE.CHARGE_INDEX)],
  [R.DISCHARGE_INDEX, kwh(C.BATTERY_STORAGE, T.BATTERY_STORAGE.DISCHARGE_INDEX)],
  [R.AC_OUTPUT_INDEX, kwh(C.HOME_OUTPUT_SENSOR, T.HOME_OUTPUT_SENSOR.INDEX)],
  [
    R.AC_VOLTAGE,
    sensor({
      category: C.ENERGY_SENSOR,
      type: T.ENERGY_SENSOR.VOLTAGE,
      unit: U.VOLT,
      min: 0,
      max: 300,
    }),
  ],
  [
    R.TEMPERATURE,
    sensor({
      category: C.DEVICE_TEMPERATURE_SENSOR,
      type: T.SENSOR.DECIMAL,
      unit: U.CELSIUS,
      min: -40,
      max: 100,
    }),
  ],
  [R.CONTROL_MODE, select, true],
  [R.FORCE_POWER, setting(0, POWER.maxCharge), true],
  [
    R.FORCE_REMAINING,
    sensor({
      category: C.DURATION,
      type: T.DURATION.DECIMAL,
      unit: U.MINUTES,
      min: 0,
      max: 1100,
      keep_history: false,
    }),
    true,
  ],
  [R.MIN_SOC, setting(SOC_BOUNDS.min, SOC_BOUNDS.max)],
  [R.MAX_SOC, setting(SOC_BOUNDS.min, SOC_BOUNDS.max)],
  [R.EPS_MODE, select],
];

export const ROLES = new Map(
  DEFINITIONS.map(([role, definition, always = false]) => [role, { definition, always }]),
);

/** Names with their unit when the core has no unit for the category. */
const UNIT_IN_NAME = { [R.FORCE_POWER]: 'W', [R.MIN_SOC]: '%', [R.MAX_SOC]: '%' };

export const idsOf = (gladys, serial) => gladys.externalIds(SERVICE, serial);

/** The serial and role of one of our feature external ids, else undefined. */
export function parseFeatureId(externalId) {
  if (typeof externalId !== 'string' || externalId.length > 200) return undefined;
  const match = new RegExp(`:${SERVICE}:([A-Z0-9_-]{4,40}):([a-z-]{1,32})$`).exec(externalId);
  return match && ROLES.has(match[2]) ? { serial: match[1], role: match[2] } : undefined;
}

/**
 * The commands, by role: what they write and how a value is checked.
 * `protective`: the choice that is a stop (never held back).
 */
export function commandOf(role) {
  switch (role) {
    case R.CONTROL_MODE:
      return {
        kind: 'mode',
        table: CONTROL_MODES,
        writable: Object.keys(CONTROL_MODES),
        protective: 'auto',
      };
    case R.FORCE_POWER:
      return { kind: 'power' };
    case R.MIN_SOC:
      return { kind: 'soc', register: REG.MIN_SOC, read: R.MIN_SOC };
    case R.MAX_SOC:
      return { kind: 'soc', register: REG.MAX_SOC, read: R.MAX_SOC };
    case R.EPS_MODE:
      return { kind: 'eps', table: EPS_MODES, writable: Object.keys(EPS_MODES), read: R.EPS_MODE };
    default:
      return undefined;
  }
}

const OPTIONS = {
  [R.CONTROL_MODE]: [['auto', 'charge', 'discharge', 'other'], CONTROL_MODE_NAMES],
  [R.EPS_MODE]: [Object.keys(EPS_MODES), EPS_MODE_NAMES],
};

function nameOf(role, language) {
  const name = word(FEATURE_NAMES[role], language);
  return UNIT_IN_NAME[role] ? `${name} (${UNIT_IN_NAME[role]})` : name;
}

/** The roles the device shows: the `always` ones, those seen with a value, those created. */
export function rolesToBuild({ seen = new Set(), created = new Set() } = {}) {
  const roles = [];
  for (const [role, entry] of ROLES) {
    if (entry.always || seen.has(role) || created.has(role)) roles.push(role);
  }
  return roles;
}

/** The Gladys device of the battery with serial number `serial`. */
export function buildDevice(gladys, { serial, model, language, roles }) {
  const i = idsOf(gladys, serial);
  return {
    name: word(DEVICE_NAME, language),
    external_id: i.device,
    model: model ? `Solakon ${model}`.slice(0, 64) : 'Solakon ONE',
    should_poll: false,
    features: roles.map((role) => {
      const entry = ROLES.get(role);
      const options = OPTIONS[role];
      return {
        name: nameOf(role, language),
        external_id: i.feature(role),
        ...entry.definition,
        ...(options
          ? {
              // The core wants a plain string label (forum topic 11402).
              supported_options: options[0].map((value, index) => ({
                value,
                label: word(options[1][value], language),
                sort_order: index + 1,
              })),
            }
          : {}),
      };
    }),
    params: [
      { name: 'protocol', value: 'Modbus TCP' },
      { name: 'SOLAKON_SERIAL', value: serial },
    ],
  };
}

/** The roles a set of values gives a value to. */
export function rolesWithValues(values) {
  return [...ROLES.keys()].filter((role) => values[role] !== undefined);
}

/**
 * The states of the values given (a value not read this time is left out:
 * Gladys keeps its last one, never republished as new). Texts are stable
 * English keys, whatever the language (scenes keep working); a text is never
 * published as a number, a number never as a text.
 */
export function deviceStates(i, values) {
  const states = [];
  for (const [role, entry] of ROLES) {
    const value = values[role];
    if (value === undefined) continue;
    const id = i.feature(role);
    if (entry.definition.category === C.TEXT) {
      if (typeof value === 'string') states.push({ device_feature_external_id: id, text: value });
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      states.push({ device_feature_external_id: id, state: value });
    }
  }
  return states;
}
