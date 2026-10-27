// -----------------------------------------------------------------------------
// The Modbus PDUs of the Solakon ONE (pure): the read requests of the blocks,
// what their answers hold, and the write requests. A decoder returns
// undefined when the answer has not the exact size asked: an unknown value is
// never a value. The write requests are checked here once more, whatever the
// caller asked: only the registers and values of WRITES, never above the
// power limits of the manufacturer, never a remote timeout of 0 (no timer).
// -----------------------------------------------------------------------------

import {
  CONTROL_MODES,
  EPS_MODES,
  FC,
  FORCE_MINUTES,
  MAX_READ,
  POWER,
  REG,
  SOC_BOUNDS,
} from '../constants.js';

/** The read request of a block (function 3). */
export function readRequest(block) {
  const { address, count } = block;
  if (!Number.isInteger(count) || count < 1 || count > MAX_READ) {
    throw new RangeError(`block ${block.key}: ${count} registers`);
  }
  const pdu = Buffer.alloc(5);
  pdu[0] = FC.READ_HOLDING;
  pdu.writeUInt16BE(address, 1);
  pdu.writeUInt16BE(count, 3);
  return pdu;
}

/** The words of a read answer, or undefined when it is not exactly what was asked. */
export function parseRead(block, pdu) {
  const { count } = block;
  if (!Buffer.isBuffer(pdu) || pdu.length < 2 || pdu[0] !== FC.READ_HOLDING) return undefined;
  const bytes = pdu[1];
  if (bytes !== count * 2 || pdu.length !== 2 + bytes) return undefined;
  const words = [];
  for (let i = 0; i < count; i += 1) words.push(pdu.readUInt16BE(2 + i * 2));
  return words;
}

const sizeOf = (type) => (type === 'string16' ? 16 : type.endsWith('32') ? 2 : 1);

/** Printable ASCII of registers (high byte first), NULs and spaces at the ends dropped. */
export function stringOf(words) {
  const bytes = [];
  for (const w of words) bytes.push((w >> 8) & 0xff, w & 0xff);
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0 || bytes[end - 1] === 0x20)) end -= 1;
  const text = bytes.slice(0, end);
  // A byte that is not printable ASCII: not a text (never shown, never kept).
  if (text.some((b) => b < 0x20 || b > 0x7e)) return undefined;
  const value = String.fromCharCode(...text).trim();
  return value === '' ? undefined : value;
}

/** One point of a block from its words. */
function pointValue(type, words) {
  switch (type) {
    case 'u16':
      return words[0];
    case 'i16':
      return words[0] >= 0x8000 ? words[0] - 0x10000 : words[0];
    case 'u32':
      return words[0] * 0x10000 + words[1];
    case 'i32': {
      const raw = words[0] * 0x10000 + words[1];
      return raw >= 0x80000000 ? raw - 0x100000000 : raw;
    }
    case 'string16':
      return stringOf(words);
    default:
      return undefined;
  }
}

/** The raw values of a block (scaled), by key; only those decodable. */
export function decodeBlock(block, words) {
  const values = {};
  if (!Array.isArray(words) || words.length !== block.count) return values;
  for (const [address, type, key, scale = 1] of block.points) {
    const at = address - block.address;
    const n = sizeOf(type);
    if (at < 0 || at + n > words.length) continue;
    const slice = words.slice(at, at + n);
    if (!slice.every((w) => Number.isInteger(w) && w >= 0 && w <= 0xffff)) continue;
    let value = pointValue(type, slice);
    if (typeof value === 'number' && scale !== 1) value /= scale;
    if (value !== undefined) values[key] = value;
  }
  return values;
}

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/**
 * The registers Gladys may write and what each accepts. Checked for every
 * write request, whatever the caller computed.
 */
const WRITES = new Map([
  [
    REG.REMOTE_CONTROL,
    { fc: FC.WRITE_SINGLE, ok: (v) => Object.values(CONTROL_MODES).includes(v) },
  ],
  [
    REG.REMOTE_TIMEOUT,
    { fc: FC.WRITE_SINGLE, ok: (v) => isInt(v, FORCE_MINUTES.min * 60, FORCE_MINUTES.max * 60) },
  ],
  // Never more than the charge limit; the discharge limit is enforced by the caller
  // on the mode read just before (and again on every forced discharge).
  [REG.REMOTE_POWER, { fc: FC.WRITE_MULTIPLE, ok: (v) => isInt(v, 0, POWER.maxCharge) }],
  [REG.REMOTE_REACTIVE, { fc: FC.WRITE_MULTIPLE, ok: (v) => isInt(v, 0, POWER.maxCharge) }],
  [REG.MIN_SOC, { fc: FC.WRITE_SINGLE, ok: (v) => isInt(v, SOC_BOUNDS.min, SOC_BOUNDS.max) }],
  [REG.MAX_SOC, { fc: FC.WRITE_SINGLE, ok: (v) => isInt(v, SOC_BOUNDS.min, SOC_BOUNDS.max) }],
  [REG.EPS_OUTPUT, { fc: FC.WRITE_SINGLE, ok: (v) => Object.values(EPS_MODES).includes(v) }],
]);

export const writableRegisters = () => [...WRITES.keys()];

/**
 * The write request of one register (function 6) or of one 32-bit value
 * (function 16, high word first), as the manufacturer's integration writes
 * them. Throws on anything not in WRITES.
 */
export function writeRequest(address, value) {
  const spec = WRITES.get(address);
  if (!spec || !spec.ok(value)) {
    throw new RangeError(`Not a value Gladys writes: ${address}=${value}`);
  }
  if (spec.fc === FC.WRITE_SINGLE) {
    const pdu = Buffer.alloc(5);
    pdu[0] = FC.WRITE_SINGLE;
    pdu.writeUInt16BE(address, 1);
    pdu.writeUInt16BE(value, 3);
    return pdu;
  }
  const pdu = Buffer.alloc(10);
  pdu[0] = FC.WRITE_MULTIPLE;
  pdu.writeUInt16BE(address, 1);
  pdu.writeUInt16BE(2, 3);
  pdu[5] = 4;
  pdu.writeUInt16BE(Math.floor(value / 0x10000) & 0xffff, 6);
  pdu.writeUInt16BE(value & 0xffff, 8);
  return pdu;
}

/**
 * Whether `answer` is the echo of `request`: a write single is answered by
 * the very same PDU, a write multiple by its function, address and count.
 */
export function isWriteEcho(request, answer) {
  if (!Buffer.isBuffer(answer)) return false;
  if (request[0] === FC.WRITE_SINGLE) return answer.length === 5 && answer.equals(request);
  return answer.length === 5 && request.subarray(0, 5).equals(answer);
}
