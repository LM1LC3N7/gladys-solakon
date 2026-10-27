// -----------------------------------------------------------------------------
// What must survive a restart, in /data (the only writable place of the
// container):
//   - the time of the last read of the device (written at most once a
//     minute, BEFORE the read), so a restart never reads it sooner than the
//     interval;
//   - the device of the last read (address, port, unit id): where a stop goes
//     while the configuration is not read yet;
//   - the return to automatic mode not seen applied yet (the stop): its
//     target, the mode read before it (`from`), whether it was written, since
//     when. A restart writes it again at once, before the configuration is
//     even read. It never ends by time;
//   - the lifetime counters of the device: the last value published of each
//     and the value held back (src/guard.js).
// No secret (the Modbus interface has none), no personal data. The file is
// readable by the container user only (0600), bounded and repaired when read.
// A file that cannot be read is not an empty one: `load()` says so, and the
// app then never overwrites it with a guess.
// -----------------------------------------------------------------------------

import { readFile, rename, writeFile } from 'node:fs/promises';
import { COUNTERS, UNIT_ID } from './constants.js';
import { serialOf } from './model.js';

export const STATE_FILE = '/data/solakon-state.json';
const MAX_BYTES = 16 * 1024;

export function fileStore(path = STATE_FILE) {
  // One write at a time: two saves never share the temporary file.
  let chain = Promise.resolve();
  return {
    /** `{ data }`, `{ data: null }` (no file) or `{ unreadable: true }`. */
    async load() {
      let text;
      try {
        text = await readFile(path, 'utf8');
      } catch (err) {
        return err?.code === 'ENOENT' ? { data: null } : { unreadable: true };
      }
      if (text.length > MAX_BYTES) return { unreadable: true };
      try {
        return { data: JSON.parse(text) };
      } catch {
        return { unreadable: true };
      }
    },
    save(data) {
      const text = JSON.stringify(data);
      const write = chain.then(async () => {
        const temporary = `${path}.tmp`;
        await writeFile(temporary, text, { mode: 0o600 });
        await rename(temporary, path);
      });
      chain = write.catch(() => {});
      return write;
    },
  };
}

/** For the tests: the same JSON round trip as the file. */
export function memoryStore(initial = null, { unreadable = false, failSave = false } = {}) {
  return {
    data: initial === null ? null : JSON.parse(JSON.stringify(initial)),
    saves: 0,
    unreadable,
    failSave,
    async load() {
      if (this.unreadable) return { unreadable: true };
      return { data: this.data === null ? null : JSON.parse(JSON.stringify(this.data)) };
    },
    async save(data) {
      if (this.failSave) throw new Error('disk full');
      this.data = JSON.parse(JSON.stringify(data));
      this.saves += 1;
    },
  };
}

/** A short text of printable ASCII, bounded, else undefined. */
const shortText = (value, max) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  /^[\x21-\x7e]*$/.test(value)
    ? value
    : undefined;

const intIn = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max ? value : undefined;

/** The device of a stop or of the last read: address, port, unit id; else undefined. */
export function targetOf(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const host = shortText(raw.host, 253);
  const port = intIn(raw.port, 1, 65535);
  const unitId = intIn(raw.unitId, UNIT_ID.min, UNIT_ID.max);
  return host && /^[a-z0-9.-]+$/.test(host) && port && unitId ? { host, port, unitId } : undefined;
}

/** An enabled remote control code (another value than the stop), else undefined. */
const enabledCode = (value) =>
  Number.isInteger(value) && value >= 1 && value <= 15 && (value & 1) === 1 ? value : undefined;

function normalizeStop(raw, now) {
  const target = targetOf(raw);
  if (!target) return undefined;
  // `since` only dates the status: a date in the future (the clock was set back, a
  // board without a clock before NTP) or none keeps the stop, dated now.
  const since = Number.isFinite(raw.since) && raw.since <= now ? raw.since : now;
  return {
    ...target,
    since,
    written: raw.written === true,
    from: enabledCode(raw.from) ?? null,
  };
}

const validPoint = (p, now) =>
  p && Number.isFinite(p.value) && p.value > 0 && Number.isFinite(p.at) && p.at <= now
    ? { value: p.value, at: p.at }
    : null;

function normalizeCounters(raw, now) {
  if (!raw || typeof raw !== 'object') return null;
  const serial = serialOf(raw.serial);
  if (!serial || !raw.guards || typeof raw.guards !== 'object') return null;
  const guards = {};
  for (const role of COUNTERS) {
    const g = raw.guards[role];
    if (!g || typeof g !== 'object') continue;
    const last = validPoint(g.last, now);
    if (!last) continue;
    const h = g.held;
    const held =
      h &&
      (h.direction === 'up' || h.direction === 'down') &&
      [h.from, h.to, h.threshold, h.at].every(Number.isFinite) &&
      h.at <= now
        ? { direction: h.direction, from: h.from, to: h.to, threshold: h.threshold, at: h.at }
        : null;
    guards[role] = { last, held };
  }
  return { serial, guards };
}

/**
 * The persisted state, repaired and bounded:
 * - `lastAttemptAt`: wall time of the last read, or null (a time in the
 *   future counts as now: never a longer wait than the interval);
 * - `target`: the device of the last read;
 * - `stop`: the return to automatic mode not seen applied, or null;
 * - `counters`: the counter guards of the device `serial`, or null.
 */
export function normalizeMemory(raw, now) {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    target: targetOf(data.target) ?? null,
    lastAttemptAt: Number.isFinite(data.lastAttemptAt) ? Math.min(data.lastAttemptAt, now) : null,
    stop: normalizeStop(data.stop, now) ?? null,
    counters: normalizeCounters(data.counters, now),
  };
}
