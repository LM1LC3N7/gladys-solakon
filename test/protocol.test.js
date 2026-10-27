// -----------------------------------------------------------------------------
// The Modbus requests (pure): only the manufacturer's batches are read, only
// its registers and bounded values are written; answers decoded strictly.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, MAX_READ, POWER } from '../src/constants.js';
import {
  decodeBlock,
  isWriteEcho,
  parseRead,
  readRequest,
  stringOf,
  writeRequest,
} from '../src/modbus/protocol.js';

// The batches of solakon-one-homeassistant 1.7.0 (compute_register_batches of its
// modbus.py over const.py, gap 10, 125 registers): every block read is one of them.
const MANUFACTURER_BATCHES = [
  [30000, 48],
  [39000, 2],
  [36001, 3],
  [37003, 1],
  [37611, 25],
  [38309, 14],
  [39053, 25],
  [39118, 35],
  [39201, 4],
  [39216, 16],
  [39272, 15],
  [39424, 1],
  [39601, 26],
  [46001, 7],
  [46607, 11],
  [49079, 1],
  [49203, 1],
  [49240, 1],
];

test('every block is a batch the manufacturer reads, its points inside', () => {
  for (const block of BLOCKS) {
    assert.ok(
      MANUFACTURER_BATCHES.some(([a, c]) => a === block.address && c === block.count),
      block.key,
    );
    assert.ok(block.count <= MAX_READ);
    for (const [address, type] of block.points) {
      const size = type === 'string16' ? 16 : type.endsWith('32') ? 2 : 1;
      assert.ok(address >= block.address && address + size <= block.address + block.count);
    }
    const pdu = readRequest(block);
    assert.deepEqual([...pdu], [3, block.address >> 8, block.address & 0xff, 0, block.count]);
  }
});

test('an answer of another size or function is not decoded', () => {
  const block = BLOCKS.find((b) => b.key === 'soc');
  assert.equal(parseRead(block, Buffer.from([3, 2, 0, 55])).length, 1);
  assert.equal(parseRead(block, Buffer.from([3, 4, 0, 55, 0, 1])), undefined);
  assert.equal(parseRead(block, Buffer.from([4, 2, 0, 55])), undefined);
  assert.equal(parseRead(block, Buffer.from([3, 2, 0])), undefined);
});

test('types: signed 16 and 32 bits high word first, scale, strings', () => {
  const block = BLOCKS.find((b) => b.key === 'battery');
  const words = new Array(16).fill(0);
  words[14] = 0xffff;
  words[15] = 0xfed4; // -300
  assert.equal(decodeBlock(block, words).batteryPower, -300);
  const energy = BLOCKS.find((b) => b.key === 'energy');
  const e = new Array(26).fill(0);
  e[0] = 1;
  e[1] = 0xe240; // 123456 -> 1234.56
  assert.equal(decodeBlock(energy, e).pvEnergy, 1234.56);
  assert.equal(stringOf([0x534b, 0x3100, 0, 0]), 'SK1');
  assert.equal(stringOf([0x0101, 0x4142]), undefined, 'a control byte: not a text');
  assert.equal(stringOf([0, 0]), undefined);
  assert.equal(stringOf([0x534b, 0x31ff, 0xffff]), 'SK1', '0xFF padding dropped');
  assert.deepEqual(decodeBlock(block, [1, 2]), {}, 'the wrong count: nothing');
});

test('writes: only the registers and values Gladys writes, with their function', () => {
  assert.deepEqual([...writeRequest(46001, 0)], [6, 0xb3, 0xb1, 0, 0]);
  assert.deepEqual([...writeRequest(46001, 3)], [6, 0xb3, 0xb1, 0, 3]);
  assert.deepEqual([...writeRequest(46003, 800)], [16, 0xb3, 0xb3, 0, 2, 4, 0, 0, 3, 0x20]);
  assert.deepEqual([...writeRequest(46002, 900)], [6, 0xb3, 0xb2, 3, 0x84]);
  for (const [address, value] of [
    [46001, 5],
    [46001, 2],
    [46002, 0],
    [46002, 3601],
    [46003, POWER.maxCharge + 1],
    [46003, -1],
    [46005, 1.5],
    [46609, 9],
    [46610, 101],
    [46613, 1],
    [46616, 100],
    [30000, 0],
  ]) {
    assert.throws(() => writeRequest(address, value), RangeError, `${address}=${value}`);
  }
});

test('the echo of a write single is the request itself; of a write multiple its head', () => {
  const single = writeRequest(46001, 0);
  assert.ok(isWriteEcho(single, Buffer.from(single)));
  assert.ok(!isWriteEcho(single, Buffer.from([6, 0xb3, 0xb1, 0, 1])));
  const multiple = writeRequest(46003, 700);
  assert.ok(isWriteEcho(multiple, multiple.subarray(0, 5)));
  assert.ok(!isWriteEcho(multiple, Buffer.from([16, 0xb3, 0xb3, 0, 1])));
});
