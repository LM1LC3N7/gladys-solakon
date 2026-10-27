import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forceMinutesOf, normalizeConfig, parseAddress } from '../src/config.js';

test('addresses: IPv4 or host name, optional port; never broadcast, multicast nor 0.x', () => {
  assert.deepEqual(parseAddress('192.168.1.70'), { host: '192.168.1.70', port: 502 });
  assert.deepEqual(parseAddress(' solakon.local:1502 '), { host: 'solakon.local', port: 1502 });
  for (const bad of [
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '192.168.1.255',
    'a..b',
    'http://x',
    'x:0',
    'x:70000',
    'x\r\n',
    '',
  ]) {
    assert.equal(parseAddress(bad), undefined, bad);
  }
});

test('the control: only `true` allows; the forced duration bounded, never 0', () => {
  assert.equal(normalizeConfig({}).allowControl, false);
  assert.equal(normalizeConfig({ allow_control: 'yes' }).allowControl, false);
  assert.equal(normalizeConfig({ allow_control: 1 }).allowControl, false);
  assert.equal(normalizeConfig({ allow_control: true }).allowControl, true);
  assert.equal(forceMinutesOf(undefined), 15);
  assert.equal(forceMinutesOf(''), 15);
  assert.equal(forceMinutesOf(' '), 15);
  assert.equal(forceMinutesOf(0), 1);
  assert.equal(forceMinutesOf(500), 60);
  assert.equal(forceMinutesOf('30'), 30);
  assert.equal(forceMinutesOf(2.5), 15);
});

test('the unit id and the interval: whole numbers, bounded; a bad unit id reads nothing', () => {
  assert.equal(normalizeConfig({ host: '10.0.0.2', unit_id: 0 }).address, undefined);
  assert.equal(normalizeConfig({ host: '10.0.0.2', unit_id: '' }).address, undefined);
  assert.equal(normalizeConfig({ host: '10.0.0.2' }).unitId, 1);
  assert.equal(normalizeConfig({ poll_interval: 1 }).pollInterval, 10);
  assert.equal(normalizeConfig({ poll_interval: '' }).pollInterval, 30);
  assert.equal(normalizeConfig({ language: 'de' }).language, 'fr');
  // What was typed is never shown again, only its length.
  assert.equal(normalizeConfig({ host: 'bad host!' }).invalid, 9);
});
