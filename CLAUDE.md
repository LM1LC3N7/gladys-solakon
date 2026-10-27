# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors. Read **[TODO.md](./TODO.md) first**: status, decisions
already taken and the next milestones.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.16), its only
runtime dependency (Modbus TCP goes through `node:net`). It reads a Solakon
ONE plug-in battery over Modbus TCP (port 502, no cloud, no authentication)
and shows it as one Gladys device per serial number; control behind an
off-by-default option, the return to automatic mode never behind it. Never
tested with a real device, not affiliated with Solakon.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run audit                             # npm audit --omit=dev
npm run cover                             # cover.png (800x534), plain Node
gi ci                                     # the whole CI locally (VM tooling)
```

## Architecture

```
index.js                  SDK bootstrap; app.boot() writes the stop kept in /data first
src/handlers.js           every SDK handler -> the app (shared with the tests)
src/app.js                SolakonApp: the line (one session), polling, backoff, device, states,
                          badge, status, buttons, command queue, the stop, counters
src/modbus/client.js      Modbus TCP session: MBAP frames, error kinds, beforeSend/startBy
src/modbus/protocol.js    blocks, requests, types, bounded writes (pure)
src/model.js              raw values -> values: ranges, signs, mode codes (pure)
src/devices.js            the Gladys device, its commands and states (pure)
src/guard.js              lifetime counters (from gladys-p1-monitor, pure)
src/publisher.js          states within 300/min
src/store.js              /data/solakon-state.json: last read, the stop, the counters
src/config.js             config_schema normalized
src/constants.js          register map, roles, limits, timings
src/i18n.js               runtime texts (en/fr)
test/fixtures/fakeSolakon.js  the fake device behind the injected connector
test/kit/                 virtual and real clocks, fake TCP server (from gladys-testkit)
```

## Rules

- **External ids are forever**: device `solakon:<SERIAL>` (frozen rule),
  feature roles in `ROLE` of `src/constants.js`, manifest keys (`host`,
  `unit_id`, `allow_control`, `force_minutes`, `poll_interval`, `language`,
  the actions `test_connection` and `accept_held_counters`).
- **Registers from the manufacturer's integration only**
  (solakon-one-homeassistant); a read is one of its batches
  (`test/protocol.test.js`, the fake refuses the rest).
- **One Modbus connection at a time, one request at a time**: everything goes
  through `useLine`; commands take the line from a poll, the stop from
  anything.
- **Commands**: never a switch or a writable binary; refused unless
  `allow_control` (checked on arrival and in `beforeSend` of every write);
  bounded on arrival, on the fresh read and in `writeRequest`; never more
  than 800 W of discharge nor 1200 W of charge; the timer always before a
  forced mode; confirmed only by the echo and a read back equal to the values
  asked; never retried.
- **The stop** (automatic mode): never behind the option, bounds, a read, a
  command, a backoff, the serial or a configuration not read; it drops the
  commands that arrived before it; never ended by time.
- **Counters**: never 0, never a drop nor a jump without the user.
- Never read sooner than the interval (button, scan, reconnection, restart);
  only the follow-up reads after a command (5 s, 20 s).
- **Answers are hostile**: MBAP frames bounded and checked; implausible values
  unknown; never log the bytes received.
- Monotonic clock for every in-memory time; the wall clock for /data and the
  counter dates only.
- Units only from the core's `DEVICE_FEATURE_UNITS_BY_CATEGORY`.
- Files are UTF-8 without BOM (`test/encoding.test.js`); tests never touch
  the network (the real-clock test uses a local server).
- Code, comments, README in English; `docs/en.md` and `docs/fr.md` in sync.
- Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md`; versions belong to the Release workflow.
