// -----------------------------------------------------------------------------
// A fake Solakon ONE behind the injected `connect` (no network), on the
// timers of the test clock: Modbus TCP framing (MBAP), function 3 reads,
// function 6 and 16 writes, answers after a delay. Like the device read by
// the manufacturer's integration, a read must be one of its batches (the
// BLOCKS: same start, same count) else exception 2; a write must target a
// register the manufacturer's integration writes, with its function. It
// counts the connections open at once (the integration must never open a
// second one). Values made up, never from a real device.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { BLOCKS } from '../../src/constants.js';

export const HOST = '192.168.1.70';
export const NOW = Date.UTC(2026, 9, 27, 10, 0, 0);
export const SERIAL = 'SK1ONE2026A';

const SINGLE = new Set([46001, 46002, 46609, 46610, 46613]);
const DOUBLE = new Set([46003, 46005]);

const words32 = (value) => {
  const raw = value < 0 ? value + 0x100000000 : value;
  return [Math.floor(raw / 0x10000) & 0xffff, raw & 0xffff];
};

const stringWords = (text, count = 16) => {
  const bytes = Buffer.alloc(count * 2);
  bytes.write(text, 'latin1');
  return Array.from({ length: count }, (_, i) => bytes.readUInt16BE(i * 2));
};

/** A device in automatic mode, charging from the sun at 300 W, 55 %. */
export function defaultRegisters() {
  const r = new Map();
  const put = (address, words) => words.forEach((w, i) => r.set(address + i, w));
  put(30000, stringWords('Solakon ONE'));
  put(30016, stringWords(SERIAL));
  put(30032, stringWords('Solakon GmbH'));
  put(39118, words32(520)); // PV power
  put(39123, [2301]); // 230.1 V
  put(39134, words32(220)); // AC power
  put(39141, [285]); // 28.5 °C
  put(39216, words32(0)); // EPS power
  put(39230, words32(-300)); // battery charging 300 W
  put(39424, [55]);
  put(39601, words32(123456)); // 1234.56 kWh
  put(39605, words32(45678)); // 456.78 kWh
  put(39609, words32(40000)); // 400 kWh
  put(39621, words32(98765)); // 987.65 kWh
  put(46001, [0]);
  put(46002, [0]);
  put(46003, words32(500));
  put(46005, words32(500));
  put(46007, [0]);
  put(46609, [10]);
  put(46610, [100]);
  put(46613, [0]);
  return r;
}

class FakeSocket extends EventEmitter {
  constructor(dev) {
    super();
    this.dev = dev;
    this.destroyed = false;
  }

  write(bytes) {
    if (this.destroyed) throw new Error('write after destroy');
    this.dev.handle(this, Buffer.from(bytes));
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.closeTimer) this.dev.timers.clearTimeout(this.closeTimer);
    setImmediate(() => {
      this.dev.open.delete(this);
      this.emit('close');
    });
  }

  end() {
    if (this.destroyed || this.ended) return;
    this.ended = true;
    this.closeTimer = this.dev.timers.setTimeout(() => this.destroy(), this.dev.closeDelay);
  }

  setNoDelay() {}
}

export function fakeSolakon({ timers, unitId = 1 } = {}) {
  const map = defaultRegisters();
  const dev = {
    map,
    unitId,
    open: new Set(),
    maxOpen: 0,
    /** Every request: { fc, address, count?, value?, words? }. */
    log: [],
    connections: 0,
    refused: 0,
    down: false,
    connectDelay: 5,
    delay: 10,
    closeDelay: 0,
    /** Addresses (start of a request) that never answer, or answer an exception. */
    silent: new Set(),
    exceptions: new Map(),
    /** Writes acknowledged but not applied, or applied after `applyDelay` ms. */
    ignoreWrites: false,
    applyDelay: 0,
    /** Writes of 46001 = 0 acknowledged but not applied (a device that ignores the stop). */
    ignoreStop: false,
    badEcho: false,
    timers,
    singleClient: false,
    get(address) {
      return map.get(address);
    },
    get32(address) {
      const raw = map.get(address) * 0x10000 + map.get(address + 1);
      return raw >= 0x80000000 ? raw - 0x100000000 : raw;
    },
    set(address, value) {
      map.set(address, value < 0 ? value + 0x10000 : value);
    },
    set32(address, value) {
      const [hi, lo] = words32(value);
      map.set(address, hi);
      map.set(address + 1, lo);
    },
    setSerial(text) {
      stringWords(text).forEach((w, i) => map.set(30016 + i, w));
    },
    apply(address, words) {
      if (dev.ignoreWrites) return;
      if (dev.ignoreStop && address === 46001 && words[0] === 0) return;
      const run = () => words.forEach((w, i) => map.set(address + i, w));
      if (dev.applyDelay > 0) timers.setTimeout(run, dev.applyDelay);
      else run();
    },
    handle(socket, frame) {
      const tid = frame.readUInt16BE(0);
      const uid = frame[6];
      const pdu = frame.subarray(7);
      const fc = pdu[0];
      const address = pdu.readUInt16BE(1);
      let entry;
      if (fc === 3) entry = { fc, address, count: pdu.readUInt16BE(3) };
      else if (fc === 6) entry = { fc, address, value: pdu.readUInt16BE(3) };
      else if (fc === 16) {
        const count = pdu.readUInt16BE(3);
        const words = [];
        for (let i = 0; i < count; i += 1) words.push(pdu.readUInt16BE(6 + i * 2));
        entry = { fc, address, count, words };
      } else entry = { fc, address };
      dev.log.push(entry);
      if (dev.silent.has(address)) return;
      timers.setTimeout(() => {
        if (socket.destroyed) return;
        let answer;
        const exception = dev.exceptions.get(address);
        if (exception) {
          answer = Buffer.from([fc | 0x80, exception]);
        } else if (fc === 3) {
          const ok = BLOCKS.some((b) => b.address === address && b.count === entry.count);
          if (!ok) {
            answer = Buffer.from([fc | 0x80, 2]);
          } else {
            answer = Buffer.alloc(2 + entry.count * 2);
            answer[0] = fc;
            answer[1] = entry.count * 2;
            for (let i = 0; i < entry.count; i += 1) {
              answer.writeUInt16BE(map.get(address + i) ?? 0, 2 + i * 2);
            }
          }
        } else if (fc === 6) {
          if (!SINGLE.has(address)) {
            answer = Buffer.from([fc | 0x80, 2]);
          } else {
            dev.apply(address, [entry.value]);
            answer = Buffer.from(pdu.subarray(0, 5));
            if (dev.badEcho) answer[4] ^= 1;
          }
        } else if (fc === 16) {
          if (!DOUBLE.has(address) || entry.count !== 2) {
            answer = Buffer.from([fc | 0x80, 2]);
          } else {
            dev.apply(address, entry.words);
            answer = Buffer.from(pdu.subarray(0, 5));
            if (dev.badEcho) answer[4] ^= 1;
          }
        } else {
          answer = Buffer.from([fc | 0x80, 1]);
        }
        const out = Buffer.alloc(7 + answer.length);
        out.writeUInt16BE(tid, 0);
        out.writeUInt16BE(0, 2);
        out.writeUInt16BE(answer.length + 1, 4);
        out[6] = uid;
        answer.copy(out, 7);
        socket.emit('data', out);
      }, dev.delay);
    },
    connect() {
      const socket = new FakeSocket(dev);
      dev.connections += 1;
      timers.setTimeout(() => {
        if (socket.destroyed) return;
        if (dev.down || (dev.singleClient && dev.open.size > 0)) {
          dev.refused += 1;
          socket.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
          return;
        }
        dev.open.add(socket);
        dev.maxOpen = Math.max(dev.maxOpen, dev.open.size);
        socket.emit('connect');
      }, dev.connectDelay);
      return socket;
    },
    writes: () => dev.log.filter((r) => r.fc === 6 || r.fc === 16),
    reads: () => dev.log.filter((r) => r.fc === 3),
  };
  dev.connectFn = () => dev.connect();
  return dev;
}
