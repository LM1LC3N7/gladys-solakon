// -----------------------------------------------------------------------------
// What the raw values mean (pure): signs, plausibility, codes, never a 0
// counter, never a text as a number.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE as R } from '../src/constants.js';
import { deviceStates } from '../src/devices.js';
import { controlModeOf, interpret, isDischargeCode, serialOf } from '../src/model.js';

test('battery power: > 0 discharges, < 0 charges, both published >= 0', () => {
  assert.deepEqual(
    [
      interpret({ batteryPower: -300 })[R.CHARGE_POWER],
      interpret({ batteryPower: -300 })[R.DISCHARGE_POWER],
    ],
    [300, 0],
  );
  assert.deepEqual(
    [
      interpret({ batteryPower: 450 })[R.CHARGE_POWER],
      interpret({ batteryPower: 450 })[R.DISCHARGE_POWER],
    ],
    [0, 450],
  );
  assert.equal(interpret({ batteryPower: 90000 })[R.CHARGE_POWER], undefined);
});

test('implausible or absent values are unknown; counters at 0 are unknown', () => {
  const v = interpret({ soc: 120, pvPower: -3, acVoltage: 0, pvEnergy: 0, chargeEnergy: 12.34 });
  assert.equal(v[R.BATTERY_LEVEL], undefined);
  assert.equal(v[R.SOLAR_POWER], 0, 'idle noise reads 0');
  assert.equal(v[R.AC_VOLTAGE], undefined, '0 V is no grid, not a measure');
  assert.equal(v[R.SOLAR_INDEX], undefined);
  assert.equal(v[R.CHARGE_INDEX], 12.34);
  assert.equal(interpret({ pvPower: -500 })[R.SOLAR_POWER], undefined);
});

test('control codes: 0 auto, 1 discharge, 3 charge, other enabled codes "other"', () => {
  assert.equal(controlModeOf(0), 'auto');
  assert.equal(controlModeOf(2), 'auto', 'bit 0 clear: remote control disabled');
  assert.equal(controlModeOf(1), 'discharge');
  assert.equal(controlModeOf(3), 'charge');
  assert.equal(controlModeOf(9), 'other');
  assert.equal(controlModeOf(16), undefined);
  assert.equal(controlModeOf(undefined), undefined);
  assert.ok(isDischargeCode(1) && isDischargeCode(5) && isDischargeCode(9) && isDischargeCode(13));
  assert.ok(isDischargeCode(undefined), 'unknown counts as a discharge');
  assert.ok(!isDischargeCode(0) && !isDischargeCode(3) && !isDischargeCode(7));
});

test('serial numbers: letters, digits, - and _, 4 to 40, upper case', () => {
  assert.equal(serialOf('sk1one'), 'SK1ONE');
  assert.equal(serialOf('ab c1'), undefined);
  assert.equal(serialOf('abc'), undefined);
  assert.equal(serialOf('a:b.c'), undefined);
});

test('states: a text never as a number, a number never as a text', () => {
  const ids = { feature: (r) => `x:${r}` };
  const states = deviceStates(ids, { [R.CONTROL_MODE]: 'charge', [R.BATTERY_LEVEL]: 50 });
  assert.deepEqual(states, [
    { device_feature_external_id: `x:${R.BATTERY_LEVEL}`, state: 50 },
    { device_feature_external_id: `x:${R.CONTROL_MODE}`, text: 'charge' },
  ]);
  assert.deepEqual(deviceStates(ids, { [R.CONTROL_MODE]: 3, [R.BATTERY_LEVEL]: 'Aus' }), []);
});
