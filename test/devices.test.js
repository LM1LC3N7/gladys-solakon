// -----------------------------------------------------------------------------
// The Gladys device (pure): ids, categories and units of the core, options
// the core accepts, no switch.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ROLE as R } from '../src/constants.js';
import { ROLES, buildDevice, commandOf, parseFeatureId, rolesToBuild } from '../src/devices.js';

const CORE = '/home/claude/code/Gladys/server/utils';
const require = createRequire(import.meta.url);
const core = existsSync(`${CORE}/constants.js`) ? require(`${CORE}/constants.js`) : undefined;
const normalizeSupportedOptions = existsSync(`${CORE}/normalizeSupportedOptions.js`)
  ? require(`${CORE}/normalizeSupportedOptions.js`).normalizeSupportedOptions
  : undefined;

const gladys = {
  externalIds: (type, id) => ({
    device: `ext:test:${type}:${id}`,
    feature: (key) => `ext:test:${type}:${id}:${key}`,
  }),
};

const device = buildDevice(gladys, {
  serial: 'SK1ONE',
  model: 'ONE',
  language: 'en',
  roles: [...ROLES.keys()],
});

test('ids: the serial number, the role; parsed back strictly', () => {
  assert.equal(device.external_id, 'ext:test:solakon:SK1ONE');
  assert.deepEqual(parseFeatureId('ext:test:solakon:SK1ONE:control-mode'), {
    serial: 'SK1ONE',
    role: R.CONTROL_MODE,
  });
  assert.equal(parseFeatureId('ext:test:solakon:SK1ONE:nope'), undefined);
  assert.equal(parseFeatureId('ext:test:solakon:sk1one:control-mode'), undefined);
  assert.equal(parseFeatureId(42), undefined);
});

test('no switch, no writable binary; the writable features are the commands', () => {
  for (const f of device.features) {
    assert.notEqual(f.type, 'binary', f.name);
    assert.notEqual(f.category, 'switch', f.name);
    const role = parseFeatureId(f.external_id).role;
    assert.equal(f.read_only, commandOf(role) === undefined, role);
  }
});

test('units: only those the core lists for the category', { skip: !core }, () => {
  const byCategory = core.DEVICE_FEATURE_UNITS_BY_CATEGORY;
  for (const f of device.features) {
    if (f.unit === undefined) continue;
    assert.ok(byCategory[f.category]?.includes(f.unit), `${f.name}: ${f.category} ${f.unit}`);
  }
  // Never an energy-sensor energy or index (injection, house totals).
  assert.ok(
    !device.features.some(
      (f) => f.category === 'energy-sensor' && ['energy', 'index'].includes(f.type),
    ),
  );
});

test('the AC power is a signed energy-sensor power, never home output nor grid', () => {
  const ac = device.features.find((f) => f.external_id.endsWith(':ac-power'));
  assert.deepEqual([ac.category, ac.type, ac.min], ['energy-sensor', 'power', -5000]);
});

test('supported options: plain string labels the core accepts', () => {
  for (const f of device.features.filter((x) => x.supported_options)) {
    for (const o of f.supported_options) {
      assert.equal(typeof o.label, 'string');
      assert.ok(o.label.trim());
      assert.ok(Number.isInteger(o.sort_order));
    }
    if (normalizeSupportedOptions) {
      assert.deepEqual(
        normalizeSupportedOptions(f.supported_options, { allowStringValues: true }),
        f.supported_options,
      );
    }
  }
});

test('roles built: the main ones always, the others once seen or created', () => {
  const roles = rolesToBuild();
  assert.ok(roles.includes(R.CONTROL_MODE) && roles.includes(R.BATTERY_LEVEL));
  assert.ok(!roles.includes(R.SOLAR_INDEX));
  assert.ok(rolesToBuild({ created: new Set([R.SOLAR_INDEX]) }).includes(R.SOLAR_INDEX));
});
