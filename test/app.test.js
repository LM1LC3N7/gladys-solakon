// -----------------------------------------------------------------------------
// The app end to end: the SDK's fake Gladys, the exact wiring of the
// container, a fake Solakon ONE, the virtual clock of the kit (it moves at
// every read).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE as R } from '../src/constants.js';
import { memoryStore } from '../src/store.js';
import { HOST, NOW, SERIAL, fakeSolakon } from './fixtures/fakeSolakon.js';
import { ALLOW, CFG, DEVICE, MINUTE, SECOND, feature, ok, refused, setup } from './helpers.js';
import { testClock } from './kit/clock.mjs';

test('a read: the device of its serial, the states, the badge, the status', async () => {
  const { gladys, state, stop, dev } = await setup();
  try {
    const device = gladys.fake.discoveredDevices[0];
    assert.equal(device.external_id, DEVICE);
    assert.ok(device.params.some((p) => p.name === 'SOLAKON_SERIAL' && p.value === SERIAL));
    assert.equal(state(R.BATTERY_LEVEL).state, 55);
    assert.equal(state(R.CHARGE_POWER).state, 300);
    assert.equal(state(R.DISCHARGE_POWER).state, 0);
    assert.equal(state(R.SOLAR_POWER).state, 520);
    assert.equal(state(R.AC_POWER).state, 220);
    assert.equal(state(R.SOLAR_INDEX).state, 1234.56);
    assert.equal(state(R.CHARGE_INDEX).state, 456.78);
    assert.equal(state(R.CONTROL_MODE).text, 'auto');
    assert.equal(state(R.FORCE_POWER).state, 500);
    assert.equal(state(R.EPS_MODE).text, 'off');
    assert.equal(gladys.fake.connectionStatus.connected, true);
    assert.match(gladys.fake.connectionStatus.message.fr, new RegExp(SERIAL));
    assert.equal(dev.maxOpen, 1);
    // Only the manufacturer's batches, function 3.
    assert.ok(dev.reads().length >= 7);
    assert.equal(dev.writes().length, 0);
    const mode = device.features.find((f) => f.external_id === feature(R.CONTROL_MODE));
    assert.deepEqual(
      mode.supported_options.map((o) => o.value),
      ['auto', 'charge', 'discharge', 'other'],
    );
    for (const o of mode.supported_options) assert.equal(typeof o.label, 'string');
  } finally {
    stop();
  }
});

test('a forced discharge: refused without the option, then power capped to 800 W, timer first', async () => {
  const { app, press, stop, dev, advance } = await setup();
  try {
    refused(await press(R.CONTROL_MODE, 'discharge'), /pilotage est désactivé/);
    assert.equal(dev.writes().length, 0);
    await app.configUpdated(ALLOW);
    dev.set32(46003, 1100);
    dev.set32(46005, 1100);
    ok(await press(R.CONTROL_MODE, 'discharge'));
    const writes = dev.writes().map((w) => [w.address, w.value ?? w.words]);
    assert.deepEqual(writes, [
      [46003, [0, 800]],
      [46005, [0, 800]],
      [46002, 900],
      [46001, 1],
    ]);
    assert.equal(dev.get(46001), 1);
    await advance(MINUTE);
  } finally {
    stop();
  }
});

test('the stop: without the option, during a read, confirmed by the read back', async () => {
  const { app, press, stop, dev } = await setup({ config: ALLOW });
  try {
    ok(await press(R.CONTROL_MODE, 'charge'));
    assert.equal(dev.get(46001), 3);
    await app.configUpdated(CFG);
    dev.delay = 400;
    ok(await press(R.CONTROL_MODE, 'auto'));
    assert.equal(dev.get(46001), 0);
    assert.equal(app.stopGuard, undefined);
    assert.equal(dev.maxOpen, 1);
  } finally {
    stop();
  }
});

test('a stop not applied is written again every 15 s, kept in /data, never ended by time', async () => {
  const store = memoryStore();
  const { app, press, stop, dev, advance } = await setup({ config: ALLOW, store });
  try {
    ok(await press(R.CONTROL_MODE, 'discharge'));
    dev.ignoreStop = true;
    refused(await press(R.CONTROL_MODE, 'auto'), /sans confirmation/);
    assert.ok(app.stopGuard);
    assert.equal(store.data.stop.from, 1);
    const before = dev.writes().filter((w) => w.address === 46001 && w.value === 0).length;
    await advance(10 * MINUTE, 100);
    const after = dev.writes().filter((w) => w.address === 46001 && w.value === 0).length;
    assert.ok(after - before >= 30, `${after - before} rewrites`);
    assert.ok(app.stopGuard, 'never ended by time');
    dev.ignoreStop = false;
    await advance(20 * SECOND, 100);
    assert.equal(app.stopGuard, undefined);
    assert.equal(store.data.stop, null);
  } finally {
    stop();
  }
});

test('after a restart, a stop kept in /data is written before the configuration is read', async () => {
  const clock = testClock({ start: NOW });
  const dev = fakeSolakon({ timers: clock.timers });
  dev.set(46001, 3);
  const store = memoryStore({
    stop: { host: HOST, port: 502, unitId: 1, since: NOW - MINUTE, written: true, from: 3 },
  });
  const { stop } = await setup({ clock, dev, store, boot: true, getConfigFails: 3 });
  try {
    assert.equal(dev.get(46001), 0);
    assert.equal(dev.writes()[0].address, 46001);
  } finally {
    stop();
  }
});

test('a forced charge: up to 1200 W, the timer of the configuration, confirmed by the read back', async () => {
  const { press, stop, dev } = await setup({ config: { ...ALLOW, force_minutes: 30 } });
  try {
    ok(await press(R.FORCE_POWER, 1200));
    assert.equal(dev.get32(46003), 1200);
    assert.equal(dev.get32(46005), 1200);
    ok(await press(R.CONTROL_MODE, 'charge'));
    assert.equal(dev.get(46002), 1800);
    assert.equal(dev.get(46001), 3);
    // Clicked again: the timer and the mode are written again (the timer restarts).
    const before = dev.writes().length;
    ok(await press(R.CONTROL_MODE, 'charge'));
    assert.deepEqual(
      dev
        .writes()
        .slice(before)
        .map((w) => w.address),
      [46002, 46001],
    );
  } finally {
    stop();
  }
});

test('the forced power: 800 W at most while a discharge is forced, 1200 W otherwise, whole watts', async () => {
  const { press, stop, dev } = await setup({ config: ALLOW });
  try {
    refused(await press(R.FORCE_POWER, 1201), /0 à 1200 W/);
    refused(await press(R.FORCE_POWER, 12.5), /nombre entier/);
    refused(await press(R.FORCE_POWER, -1), /0 à 1200 W/);
    ok(await press(R.CONTROL_MODE, 'discharge'));
    refused(await press(R.FORCE_POWER, 900), /0 à 800 W/);
    assert.equal(dev.get32(46003), 500);
    ok(await press(R.FORCE_POWER, 800));
    // Another enabled mode set elsewhere (9: grid discharge) counts as a discharge.
    dev.set(46001, 9);
    refused(await press(R.FORCE_POWER, 1000), /0 à 800 W/);
    dev.set(46001, 0);
    ok(await press(R.FORCE_POWER, 1000));
    assert.equal(dev.get32(46003), 1000);
  } finally {
    stop();
  }
});

test('state of charge limits: bounded, the minimum never above the maximum read just before', async () => {
  const { press, stop, dev } = await setup({ config: ALLOW });
  try {
    refused(await press(R.MIN_SOC, 5), /10 à 100 %/);
    ok(await press(R.MAX_SOC, 80));
    assert.equal(dev.get(46610), 80);
    refused(await press(R.MIN_SOC, 90), /au-dessus du maximum/);
    ok(await press(R.MIN_SOC, 20));
    assert.equal(dev.get(46609), 20);
    dev.set(46609, 30);
    refused(await press(R.MAX_SOC, 25), /au-dessus du maximum/);
    ok(await press(R.EPS_MODE, 'ups'));
    assert.equal(dev.get(46613), 3);
    refused(await press(R.EPS_MODE, 'UPS'), /Pas un des choix/);
    refused(await press(R.CONTROL_MODE, 'other'), /seulement affiché/);
    refused(await press(R.SOLAR_POWER, 1), /lecture seule/);
  } finally {
    stop();
  }
});

test('the option is checked again right before the write', async () => {
  const { app, fire, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    dev.delay = 300;
    const ack = fire(R.CONTROL_MODE, 'charge');
    await advance(400, 10);
    await app.configUpdated(CFG);
    await advance(5 * SECOND, 50);
    refused(await ack, /désactivé|configuration a changé/);
    assert.equal(
      dev.writes().filter((w) => w.address === 46001).length,
      0,
      'nothing written after the option was turned off',
    );
  } finally {
    stop();
  }
});

test('nothing clicked before a stop leaves after it', async () => {
  const { fire, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    dev.delay = 200;
    const forced = fire(R.CONTROL_MODE, 'discharge');
    const power = fire(R.FORCE_POWER, 700);
    await advance(250, 10);
    const stopped = fire(R.CONTROL_MODE, 'auto');
    await advance(10 * SECOND, 50);
    ok(await stopped);
    refused(await forced);
    refused(await power);
    const writes = dev.writes();
    const at = writes.findIndex((w) => w.address === 46001 && w.value === 0);
    assert.ok(at >= 0);
    assert.equal(writes.slice(at + 1).length, 0, 'nothing after the stop');
    assert.equal(dev.get(46001), 0);
    assert.equal(dev.maxOpen, 1);
  } finally {
    stop();
  }
});

test('the stop goes whatever: device never read, read stuck, backoff, queue full', async () => {
  const { app, fire, press, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    // A read stuck on a silent block: the stop ends it and goes.
    dev.silent.add(39424);
    app.clearTimer();
    app.lastAttemptAt = -Infinity;
    const reading = app.tick();
    await advance(200, 10);
    dev.silent.clear();
    dev.set(46001, 3);
    const quick = fire(R.CONTROL_MODE, 'auto');
    // The stuck read (2 s timeout) is ended at once: the stop is written well before.
    await advance(400, 10);
    assert.equal(dev.get(46001), 0, 'written within 400 ms');
    await advance(5 * SECOND, 50);
    ok(await quick);
    await advance(SECOND);
    await reading;
    // Backoff: the device was down for the reads, back for the stop.
    dev.down = true;
    app.clearTimer();
    app.lastAttemptAt = -Infinity;
    const failing = app.tick();
    await advance(SECOND);
    await failing;
    assert.equal(app.unit.online, false);
    dev.down = false;
    dev.set(46001, 1);
    ok(await press(R.CONTROL_MODE, 'auto'));
    assert.equal(dev.get(46001), 0);
    // Queue full of slow commands: the stop still goes, at once.
    dev.delay = 100;
    const acks = [];
    for (let i = 0; i < 20; i += 1) acks.push(fire(R.MAX_SOC, 90 + (i % 5)));
    await advance(50, 10);
    const full = await Promise.race([
      Promise.all(acks.slice(17)),
      new Promise((r) => setImmediate(r)),
    ]);
    assert.ok(full, 'the commands beyond the queue are refused at once');
    for (const ack of full) refused(ack, /Trop de commandes/);
    dev.set(46001, 3);
    const stopped = fire(R.CONTROL_MODE, 'auto');
    await advance(5 * SECOND, 50);
    ok(await stopped);
    assert.equal(dev.get(46001), 0);
    await advance(20 * SECOND, 100);
    await Promise.all(acks);
  } finally {
    stop();
  }
});

test('a stop while the device refuses connections: tried again within 3 s', async () => {
  const { fire, stop, dev, advance } = await setup();
  try {
    dev.set(46001, 3);
    dev.down = true;
    const ack = fire(R.CONTROL_MODE, 'auto');
    await advance(1000, 10);
    dev.down = false;
    await advance(4 * SECOND, 50);
    ok(await ack);
    assert.equal(dev.get(46001), 0);
  } finally {
    stop();
  }
});

test('a stop never sent (device down) is kept, retried every 15 s, then applied', async () => {
  const store = memoryStore();
  const { app, fire, stop, dev, advance } = await setup({ store });
  try {
    dev.set(46001, 1);
    dev.down = true;
    const ack = fire(R.CONTROL_MODE, 'auto');
    await advance(5 * SECOND, 50);
    refused(await ack, /pas encore envoyé/);
    assert.ok(store.data.stop);
    assert.equal(store.data.stop.written, false);
    await advance(MINUTE, 100);
    assert.ok(app.stopGuard, 'still held while the device is down');
    dev.down = false;
    await advance(20 * SECOND, 100);
    assert.equal(dev.get(46001), 0);
    assert.equal(app.stopGuard, undefined);
  } finally {
    stop();
  }
});

test('a stop is let go when another forced mode set elsewhere is read twice in a row, nothing written between', async () => {
  const { app, press, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    ok(await press(R.CONTROL_MODE, 'discharge'));
    dev.ignoreStop = true;
    refused(await press(R.CONTROL_MODE, 'auto'), /sans confirmation/);
    assert.equal(app.stopGuard.from, 1);
    // Another tool sets a grid charge (11).
    dev.set(46001, 11);
    const before = dev.writes().length;
    await advance(20 * SECOND, 100);
    assert.equal(app.stopGuard, undefined);
    assert.equal(dev.writes().length, before, 'never written over a change made elsewhere');
    assert.equal(dev.get(46001), 11);
  } finally {
    stop();
  }
});

test('a newer forced mode clicked with the option ends the stop held', async () => {
  const { app, press, stop, dev } = await setup({ config: ALLOW });
  try {
    ok(await press(R.CONTROL_MODE, 'discharge'));
    dev.ignoreStop = true;
    refused(await press(R.CONTROL_MODE, 'auto'), /sans confirmation/);
    assert.ok(app.stopGuard);
    ok(await press(R.CONTROL_MODE, 'charge'));
    assert.equal(app.stopGuard, undefined);
    assert.equal(dev.get(46001), 3);
  } finally {
    stop();
  }
});

test('a write acknowledged but not applied: "sent, without confirmation", never success', async () => {
  const { press, stop, dev } = await setup({ config: ALLOW });
  try {
    dev.ignoreWrites = true;
    refused(await press(R.MAX_SOC, 90), /envoyée, sans confirmation/);
    refused(await press(R.CONTROL_MODE, 'charge'), /envoyée, sans confirmation/);
    dev.ignoreWrites = false;
    dev.down = true;
    refused(await press(R.MAX_SOC, 90), /non envoyée/);
  } finally {
    stop();
  }
});

test('the configuration cannot be read in `connected`: tried again forever, then the device is read', async () => {
  const { gladys, stop, advance, dev } = await setup({ getConfigFails: 3, create: false });
  try {
    assert.equal(gladys.fake.connectionStatus.connected, false);
    assert.match(gladys.fake.connectionStatus.message.fr, /configuration n’a pas pu être lue/);
    assert.equal(dev.connections, 0);
    await advance(2 * MINUTE, 100);
    assert.equal(gladys.fake.connectionStatus.connected, true);
    assert.ok(dev.connections > 0);
  } finally {
    stop();
  }
});

test('a lifetime counter: never 0, a drop or a jump held (status), accepted in two presses only', async () => {
  const store = memoryStore();
  const { gladys, app, stop, dev, advance, state } = await setup({ store });
  try {
    const published = () =>
      gladys.fake.states
        .filter((s) => s.device_feature_external_id === feature(R.SOLAR_INDEX))
        .map((s) => s.state);
    assert.equal(state(R.SOLAR_INDEX).state, 1234.56);
    // A counter at 0 (not counting): never published.
    dev.set32(39601, 0);
    await advance(31 * SECOND, 100);
    assert.ok(!published().includes(0));
    // A drop (reset or replacement): held, said in the status.
    dev.set32(39601, 1000);
    await advance(31 * SECOND, 100);
    assert.ok(!published().includes(10));
    assert.match(
      gladys.fake.connectionStatus.message.fr,
      /Énergie solaire : baisse de 1234\.56 à 10 kWh/,
    );
    assert.equal(store.data.counters.guards[R.SOLAR_INDEX].held.to, 10);
    // Held, whatever the time.
    await advance(10 * MINUTE, 500);
    assert.ok(!published().includes(10));
    // First press: the list; second press: accepted, published at the next read.
    const first = await app.acceptCounters();
    assert.match(first.fr, /Énergie solaire 1234\.56 → 10 kWh/);
    assert.ok(!published().includes(10));
    const second = await app.acceptCounters();
    assert.match(second.fr, /Acceptés : Énergie solaire/);
    await advance(31 * SECOND, 100);
    assert.equal(state(R.SOLAR_INDEX).state, 10);
    assert.doesNotMatch(gladys.fake.connectionStatus.message.fr, /baisse/);
    // A jump up: held too.
    dev.set32(39601, 900000);
    await advance(31 * SECOND, 100);
    assert.ok(!published().includes(9000));
    assert.match((await app.acceptCounters()).fr, /10 → 9000 kWh/);
    // The value moved a little between the two presses: accepted, within the margin.
    dev.set32(39601, 900003);
    await advance(31 * SECOND, 100);
    assert.match((await app.acceptCounters()).fr, /Acceptés : Énergie solaire/);
    await advance(31 * SECOND, 100);
    assert.equal(state(R.SOLAR_INDEX).state, 9000.03);
    // A jump again, then far beyond the value listed: held again, nothing published.
    dev.set32(39601, 2000000);
    await advance(31 * SECOND, 100);
    assert.match((await app.acceptCounters()).fr, /9000\.03 → 20000 kWh/);
    dev.set32(39601, 3000000);
    await advance(31 * SECOND, 100);
    assert.match((await app.acceptCounters()).fr, /Acceptés : Énergie solaire/);
    await advance(31 * SECOND, 100);
    assert.ok(!published().includes(30000), 'beyond the value accepted: held again');
    assert.match(gladys.fake.connectionStatus.message.fr, /saut de 9000\.03 à 30000 kWh/);
    // Nothing held: the second press says so, never "published".
    const none = await app.acceptCounters();
    assert.doesNotMatch(none.fr, /Publiés/);
  } finally {
    stop();
  }
});

test('another device answers at the address: its own device, commands to the first one refused', async () => {
  const { gladys, press, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    dev.setSerial('SK2OTHER99');
    await advance(31 * SECOND, 100);
    assert.ok(
      gladys.fake.discoveredDevices.some((d) => d.external_id.endsWith(':solakon:SK2OTHER99')),
    );
    refused(await press(R.MAX_SOC, 90), /autre numéro de série/);
    assert.equal(dev.writes().length, 0);
    // The stop goes to the address all the same (it only ever stops a forced mode).
    dev.set(46001, 3);
    ok(await press(R.CONTROL_MODE, 'auto'));
    assert.equal(dev.get(46001), 0);
    // An unreadable serial: nothing published, the status says why.
    dev.setSerial('');
    await advance(31 * SECOND, 100);
    assert.match(gladys.fake.connectionStatus.message.fr, /numéro de série est illisible/);
    assert.equal(gladys.fake.connectionStatus.connected, false);
  } finally {
    stop();
  }
});

test('never read sooner than the interval: button, scan, reconnection, restart', async () => {
  const clock = testClock({ start: NOW });
  const store = memoryStore();
  const first = await setup({ clock, store });
  const reads = () => first.dev.reads().filter((r) => r.address === 30000).length;
  try {
    assert.equal(reads(), 1);
    const answer = await first.app.testConnection();
    assert.match(answer.fr, /Prochaine lecture dans/);
    await first.gladys.fake.scanRequest();
    await first.app.connected({ host: HOST });
    await first.advance(20 * SECOND, 100);
    assert.equal(reads(), 1);
    await first.advance(15 * SECOND, 100);
    assert.equal(reads(), 2);
  } finally {
    first.stop();
  }
  // A restart 10 s after the last read: the next read waits for the interval.
  const second = await setup({ clock, store });
  try {
    assert.equal(second.dev.reads().length, 0);
    await second.advance(MINUTE + 31 * SECOND, 100);
    assert.ok(second.dev.reads().length > 0);
  } finally {
    second.stop();
  }
});

test('/data unreadable is never overwritten; a failed save never blocks the stop', async () => {
  const store = memoryStore(null, { unreadable: true });
  const { app, press, stop, dev } = await setup({ store, config: ALLOW });
  try {
    assert.equal(store.saves, 0);
    ok(await press(R.CONTROL_MODE, 'charge'));
    ok(await press(R.CONTROL_MODE, 'auto'));
    assert.equal(store.saves, 0);
    assert.equal(dev.get(46001), 0);
    assert.equal(app.memoryUnreadable, true);
  } finally {
    stop();
  }
  const failing = memoryStore(null, { failSave: true });
  const again = await setup({ store: failing, config: ALLOW });
  try {
    ok(await again.press(R.CONTROL_MODE, 'discharge'));
    ok(await again.press(R.CONTROL_MODE, 'auto'));
    assert.equal(again.dev.get(46001), 0);
  } finally {
    again.stop();
  }
});

test('a scene setting five values on a slow device: all set, one connection', async () => {
  const { fire, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    dev.delay = 150;
    const acks = [
      fire(R.FORCE_POWER, 600),
      fire(R.MAX_SOC, 90),
      fire(R.MIN_SOC, 20),
      fire(R.EPS_MODE, 'eps'),
      fire(R.CONTROL_MODE, 'charge'),
    ];
    await advance(20 * SECOND, 50);
    for (const ack of acks) {
      const a = await ack;
      // Answered by 3.5 s: done, or still on its way (then said so).
      assert.ok(a.success || /attente|sans confirmation/.test(String(a.error)), String(a.error));
    }
    assert.equal(dev.get32(46003), 600);
    assert.equal(dev.get(46610), 90);
    assert.equal(dev.get(46609), 20);
    assert.equal(dev.get(46613), 2);
    assert.equal(dev.get(46001), 3);
    assert.equal(dev.maxOpen, 1);
  } finally {
    stop();
  }
});

test('a stop clicked while the configuration cannot be read goes to the device of the last read', async () => {
  const clock = testClock({ start: NOW });
  const dev = fakeSolakon({ timers: clock.timers });
  dev.set(46001, 1);
  const store = memoryStore({ target: { host: HOST, port: 502, unitId: 1 } });
  const { press, stop } = await setup({ clock, dev, store, getConfigFails: 100, create: false });
  try {
    ok(await press(R.CONTROL_MODE, 'auto'));
    assert.equal(dev.get(46001), 0);
  } finally {
    stop();
  }
});

test('a stop clicked before any read: the first forced mode read is the mode of before', async () => {
  const { app, press, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    app.unit.values.controlCode = undefined;
    dev.set(46001, 1);
    dev.ignoreStop = true;
    refused(await press(R.CONTROL_MODE, 'auto'), /sans confirmation/);
    await advance(20 * SECOND, 100);
    assert.equal(app.stopGuard.from, 1);
    const before = dev.writes().length;
    await advance(MINUTE, 100);
    assert.ok(dev.writes().length > before, 'written again over the mode of before');
  } finally {
    stop();
  }
});

test('a device created: its recent values at once, never an old read', async () => {
  const { gladys, app, stop, advance } = await setup({ create: false });
  try {
    await advance(3 * MINUTE, 500);
    app.unit.readAt = app.mono() - 3 * MINUTE;
    const count = gladys.fake.states.length;
    await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
    await advance(2 * SECOND, 100);
    // The last read is older than 2 minutes here: nothing sent as new.
    assert.equal(gladys.fake.states.length, count);
  } finally {
    stop();
  }
});

test('an optional block refused never blocks the values; a core block fails the read', async () => {
  const { gladys, app, stop, dev, advance, state } = await setup();
  try {
    dev.exceptions.set(39601, 4);
    dev.set(39424, 60);
    await advance(31 * SECOND, 100);
    assert.equal(state(R.BATTERY_LEVEL).state, 60);
    assert.match(gladys.fake.connectionStatus.message.fr, /Non lus cette fois : energy/);
    // Never served by this firmware (illegal data address before any answer): skipped.
    app.answered.delete('settings');
    dev.exceptions.set(46607, 2);
    await advance(31 * SECOND, 100);
    assert.ok(app.absent.has('settings'));
    dev.exceptions.set(39424, 4);
    await advance(31 * SECOND, 100);
    assert.equal(app.unit.online, false);
  } finally {
    stop();
  }
});

test('a forced mode clicked while a stop is under way is refused; a stuck /data never holds the stop', async () => {
  const store = memoryStore();
  const { fire, stop, dev, advance } = await setup({ config: ALLOW, store });
  try {
    dev.set(46001, 1);
    dev.delay = 300;
    // A disk that never answers.
    store.save = () => new Promise(() => {});
    const stopped = fire(R.CONTROL_MODE, 'auto');
    await advance(50, 10);
    const forced = fire(R.CONTROL_MODE, 'discharge');
    await advance(5 * SECOND, 50);
    ok(await stopped);
    refused(await forced, /retour en mode automatique est en cours/);
    assert.equal(dev.get(46001), 0);
  } finally {
    stop();
  }
});

test('another mode read only once (a glitch) does not let the stop go', async () => {
  const { app, press, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    ok(await press(R.CONTROL_MODE, 'discharge'));
    dev.ignoreStop = true;
    refused(await press(R.CONTROL_MODE, 'auto'), /sans confirmation/);
    dev.set(46001, 11);
    const reads = () => dev.reads().filter((r) => r.address === 46001).length;
    const before = reads();
    while (reads() === before) await advance(100, 10);
    await advance(50, 10);
    dev.set(46001, 1);
    await advance(30 * SECOND, 100);
    assert.ok(app.stopGuard, 'still held');
    assert.ok(
      dev.writes().filter((w) => w.address === 46001 && w.value === 0).length >= 2,
      'written again over the mode of before',
    );
  } finally {
    stop();
  }
});

test('B1: a stop never written is written when the device answers again, whatever mode it shows', async () => {
  const store = memoryStore();
  const { app, fire, stop, dev, advance } = await setup({
    store,
    config: { ...CFG, poll_interval: 10 },
  });
  try {
    dev.set(46001, 1);
    await advance(11 * SECOND, 100);
    assert.equal(app.unit.values.controlCode, 1);
    // Another tool forces a charge, then the link drops; the last poll still says 1.
    dev.set(46001, 3);
    dev.down = true;
    const ack = fire(R.CONTROL_MODE, 'auto');
    await advance(5 * SECOND, 50);
    refused(await ack, /pas encore envoyé/);
    assert.equal(app.stopGuard.written, false);
    dev.down = false;
    dev.ignoreStop = true;
    await advance(40 * SECOND, 100);
    const stops = dev.writes().filter((w) => w.address === 46001 && w.value === 0);
    assert.ok(stops.length >= 1, 'the stop is written');
    assert.ok(app.stopGuard, 'still held: never "changed elsewhere" on a stale mode');
    assert.equal(app.stopGuard.from, 3, 'the mode read in the session that wrote it');
    dev.ignoreStop = false;
    await advance(20 * SECOND, 100);
    assert.equal(dev.get(46001), 0);
    assert.equal(app.stopGuard, undefined);
  } finally {
    stop();
  }
});

test('B1 at boot: a stop kept in /data with a stale mode is written, never let go unwritten', async () => {
  const clock = testClock({ start: NOW });
  const dev = fakeSolakon({ timers: clock.timers });
  dev.set(46001, 3);
  dev.down = true;
  const store = memoryStore({
    stop: { host: HOST, port: 502, unitId: 1, since: NOW - MINUTE, written: true, from: 1 },
  });
  const { app, stop, advance } = await setup({
    clock,
    dev,
    store,
    boot: true,
    getConfigFails: 100,
  });
  try {
    assert.equal(app.stopGuard.written, false);
    dev.down = false;
    dev.ignoreStop = true;
    await advance(40 * SECOND, 100);
    assert.ok(dev.writes().some((w) => w.address === 46001 && w.value === 0));
    assert.ok(app.stopGuard);
    assert.equal(app.stopGuard.from, 3);
  } finally {
    stop();
  }
});

test('I1: a configuration read before a newer save never overwrites it', async () => {
  const { app, clock, press, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    const slow = () =>
      new Promise((resolve) => clock.timers.setTimeout(() => resolve({ ...ALLOW }), 400));
    const reconnect = app.onConnected(slow);
    await advance(100, 10);
    await app.configUpdated(CFG);
    await advance(1000, 10);
    await reconnect;
    assert.equal(app.config.allowControl, false, 'the save made after the request wins');
    refused(await press(R.EPS_MODE, 'ups'), /pilotage est désactivé/);
    assert.equal(dev.writes().length, 0);
  } finally {
    stop();
  }
});

test('I2: writes that left are never "not sent": sent, without confirmation, and a follow-up read', async () => {
  const { press, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    dev.set32(46003, 1100);
    dev.set32(46005, 1100);
    dev.silent.add(46002);
    const ack = await press(R.CONTROL_MODE, 'discharge');
    refused(ack, /envoyée, sans confirmation.*registres écrits : 46003, 46005, 46002/);
    assert.equal(dev.get32(46003), 800);
    dev.silent.clear();
    const reads = dev.reads().length;
    await advance(6 * SECOND, 100);
    assert.ok(dev.reads().length > reads, 'a follow-up read');
  } finally {
    stop();
  }
});

test('I3: a silent optional block never blocks the values; skipped after 3 failures; status exact', async () => {
  const { gladys, app, stop, dev, advance, state } = await setup();
  try {
    dev.silent.add(39601);
    dev.set(39424, 61);
    await advance(31 * SECOND, 100);
    assert.equal(state(R.BATTERY_LEVEL).state, 61);
    assert.equal(gladys.fake.connectionStatus.connected, true);
    assert.match(gladys.fake.connectionStatus.message.fr, /Non lus cette fois : energy, settings/);
    await advance(2 * 31 * SECOND, 100);
    const asked = dev.reads().filter((r) => r.address === 39601).length;
    await advance(3 * 31 * SECOND, 100);
    assert.equal(dev.reads().filter((r) => r.address === 39601).length, asked, 'skipped');
    assert.equal(app.unit.online, true);
  } finally {
    stop();
  }
});

test('the option is checked again between the writes of one command', async () => {
  const { app, fire, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    dev.set32(46003, 1100);
    dev.set32(46005, 1100);
    dev.delay = 200;
    const ack = fire(R.CONTROL_MODE, 'discharge');
    while (!dev.writes().length) await advance(10, 10);
    await app.configUpdated(CFG);
    await advance(5 * SECOND, 50);
    refused(await ack, /sans confirmation|désactivé/);
    assert.equal(dev.writes().filter((w) => w.address === 46001).length, 0);
  } finally {
    stop();
  }
});

test('the EPS output needs the option too', async () => {
  const { press, stop, dev } = await setup();
  try {
    refused(await press(R.EPS_MODE, 'eps'), /pilotage est désactivé/);
    assert.equal(dev.writes().length, 0);
  } finally {
    stop();
  }
});

test('the held stop: ended by a poll reading automatic; an undocumented or unreadable mode is written over', async () => {
  const { app, press, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    ok(await press(R.CONTROL_MODE, 'discharge'));
    dev.ignoreStop = true;
    refused(await press(R.CONTROL_MODE, 'auto'), /sans confirmation/);
    const zeros = () => dev.writes().filter((w) => w.address === 46001 && w.value === 0).length;
    // An undocumented code: written over.
    dev.set(46001, 32);
    let before = zeros();
    await advance(40 * SECOND, 100);
    assert.ok(zeros() > before, 'undocumented mode written over');
    // A refused read of the mode: written over, in doubt.
    dev.set(46001, 1);
    dev.readExceptions.set(46001, 4);
    before = zeros();
    await advance(40 * SECOND, 100);
    assert.ok(zeros() > before, 'unreadable mode written over');
    dev.readExceptions.clear();
    assert.ok(app.stopGuard);
    // A poll reading automatic ends it at once (before any check).
    dev.set(46001, 0);
    app.clearTimer();
    app.lastAttemptAt = -Infinity;
    if (app.stopGuard.timer) clearTimeout(app.stopGuard.timer);
    const reading = app.tick();
    await advance(500, 10);
    await reading;
    assert.equal(app.stopGuard, undefined);
  } finally {
    stop();
  }
});

test('the held stop waits for the device to apply it, and gives the line to a command', async () => {
  const { app, press, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    ok(await press(R.CONTROL_MODE, 'discharge'));
    dev.ignoreStop = true;
    refused(await press(R.CONTROL_MODE, 'auto'), /sans confirmation/);
    const guard = app.stopGuard;
    assert.equal(app.decideStop(guard, 1, guard.sentAt + 1000), 'wait');
    assert.equal(app.decideStop(guard, 1, guard.sentAt + 6000), 'resend');
    // A command waiting: the check reads nothing, writes nothing, and tries again soon.
    const before = dev.log.length;
    app.queue.push({});
    await app.runCheck();
    assert.equal(dev.log.length, before);
    app.queue.length = 0;
    await advance(2 * SECOND, 100);
    assert.ok(dev.log.length > before);
  } finally {
    stop();
  }
});

test('configurations saved one after the other apply in order, the last one wins', async () => {
  const { app, stop, dev, advance } = await setup();
  try {
    dev.delay = 300;
    app.clearTimer();
    app.lastAttemptAt = -Infinity;
    const reading = app.tick();
    await advance(50, 10);
    const first = app.configUpdated({ host: '192.168.1.99' });
    const second = app.configUpdated({ ...ALLOW, poll_interval: 60 });
    await advance(5 * SECOND, 50);
    await Promise.all([first, second, reading]);
    assert.equal(app.config.address.host, HOST);
    assert.equal(app.config.allowControl, true);
    assert.equal(app.config.pollInterval, 60);
  } finally {
    stop();
  }
});

test('a forced discharge on a slow device: every write of the command leaves', async () => {
  const { press, stop, dev } = await setup({ config: ALLOW });
  try {
    dev.set32(46003, 1100);
    dev.set32(46005, 1100);
    dev.delay = 200;
    const ack = await press(R.CONTROL_MODE, 'discharge', 8 * SECOND);
    assert.ok(ack.success || /sans confirmation/.test(String(ack.error)), String(ack.error));
    assert.equal(dev.get(46001), 1);
    assert.equal(dev.get(46002), 900);
  } finally {
    stop();
  }
});

test('a stop written without a read back: the forced mode read later is the mode of before', async () => {
  const { app, press, stop, dev, advance } = await setup({ config: ALLOW });
  try {
    ok(await press(R.CONTROL_MODE, 'discharge'));
    dev.ignoreStop = true;
    dev.silentReads.add(46001);
    refused(await press(R.CONTROL_MODE, 'auto'), /sans confirmation/);
    assert.equal(app.stopGuard.written, true);
    dev.silentReads.clear();
    const zeros = () => dev.writes().filter((w) => w.address === 46001 && w.value === 0).length;
    const before = zeros();
    await advance(MINUTE, 100);
    assert.ok(app.stopGuard, 'never "changed elsewhere": the mode it failed to replace');
    assert.equal(app.stopGuard.from, 1);
    assert.ok(zeros() > before);
  } finally {
    stop();
  }
});
