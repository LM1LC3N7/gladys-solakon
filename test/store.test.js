// -----------------------------------------------------------------------------
// /data: repaired and bounded, a future date invalid, an unreadable file never
// taken for an empty one; the real file in a temporary directory, removed.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROLE as R } from '../src/constants.js';
import { fileStore, normalizeMemory } from '../src/store.js';

const NOW = Date.UTC(2026, 9, 27, 10);
const stop = {
  host: '192.168.1.70',
  port: 502,
  unitId: 1,
  since: NOW - 1000,
  written: true,
  from: 3,
};

test('a stop: kept when valid, its date never in the future, its mode an enabled code', () => {
  assert.deepEqual(normalizeMemory({ stop }, NOW).stop, stop);
  assert.equal(normalizeMemory({ stop: { ...stop, since: NOW + 60_000 } }, NOW).stop, null);
  assert.equal(normalizeMemory({ stop: { ...stop, host: 'a\nb' } }, NOW).stop, null);
  assert.equal(normalizeMemory({ stop: { ...stop, from: 2 } }, NOW).stop.from, null);
  assert.equal(normalizeMemory({ stop: { ...stop, unitId: 0 } }, NOW).stop, null);
});

test('counters: valid points only, never a date in the future', () => {
  const counters = {
    serial: 'SK1',
    guards: { [R.SOLAR_INDEX]: { last: { value: 10, at: NOW }, held: null } },
  };
  assert.equal(normalizeMemory({ counters }, NOW).counters, null, 'serial too short');
  counters.serial = 'SK1ONE';
  assert.deepEqual(normalizeMemory({ counters }, NOW).counters.guards[R.SOLAR_INDEX].last, {
    value: 10,
    at: NOW,
  });
  counters.guards[R.SOLAR_INDEX].last.at = NOW + 1;
  assert.deepEqual(normalizeMemory({ counters }, NOW).counters.guards, {});
});

test('the file: written 0600, read back; unreadable is not empty', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'solakon-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.json');
  const store = fileStore(path);
  assert.deepEqual(await store.load(), { data: null });
  await store.save({ stop });
  assert.deepEqual((await store.load()).data.stop, stop);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await writeFile(path, '{not json');
  assert.deepEqual(await store.load(), { unreadable: true });
  await writeFile(path, 'x'.repeat(20_000));
  assert.deepEqual(await store.load(), { unreadable: true });
});
