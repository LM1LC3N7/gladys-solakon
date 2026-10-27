// -----------------------------------------------------------------------------
// The app on the REAL clock, sped up 20 times (30 s of the interval are 1.5 s,
// but it is the real clock: it moves between any two reads of it), against a
// real local TCP server answering Modbus TCP like the fake Solakon ONE: the
// polls really start at the interval, never sooner, on one connection at a
// time, and a stop goes at once.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { SolakonApp } from '../src/app.js';
import { memoryStore } from '../src/store.js';
import { SERIAL, fakeSolakon } from './fixtures/fakeSolakon.js';
import { measurePeriod, realClock, spyOn } from './kit/clock.mjs';
import { tcpServer } from './kit/tcp.mjs';

const SPEED = 20;
const INTERVAL = 30_000;

test('real clock x20: a poll every interval, one connection, a stop at once', async () => {
  const immediate = { setTimeout: (fn) => (fn(), 0), clearTimeout() {} };
  const dev = fakeSolakon({ timers: immediate });
  dev.set(46001, 1);
  // The fake answers through a socket-like object: its answer is the TCP answer.
  const device = await tcpServer({
    onData: (chunk) =>
      new Promise((resolve) => {
        dev.handle({ destroyed: false, emit: (_event, data) => resolve(data) }, chunk);
      }),
    latencyMs: 2,
  });
  const clock = realClock({ speed: SPEED });
  const gladys = createFakeGladys({ config: {} });
  await gladys.connect();
  const quiet = () => {};
  const app = new SolakonApp({
    gladys,
    logger: { debug: quiet, info: quiet, warn: quiet, error: quiet },
    now: clock.now,
    clock: clock.monotonic,
    timers: clock.timers,
    store: memoryStore(),
  });
  const spy = spyOn(app, 'run', clock);
  try {
    await app.connected({ host: `127.0.0.1:${device.port}`, poll_interval: INTERVAL / 1000 });
    const gaps = await measurePeriod(spy, { count: 3, period: INTERVAL });
    assert.equal(gaps.length, 2);
    assert.ok(device.peak <= 1, `${device.peak} connections at once`);
    assert.equal(gladys.fake.connectionStatus.connected, true);
    const started = clock.monotonic();
    await app.setValue(
      undefined,
      { external_id: `ext:test-integration:solakon:${SERIAL}:control-mode` },
      'auto',
    );
    assert.equal(dev.get(46001), 0);
    assert.ok(clock.monotonic() - started < 3500, 'within the ack budget');
  } finally {
    spy.restore();
    app.shutdown();
    clock.close();
    await device.close();
  }
  assert.ok(clock.timersSet < 200, `${clock.timersSet} timers`);
});
