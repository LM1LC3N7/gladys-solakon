# TODO — Solakon ONE v1

Handoff document: what is done, what was decided, what comes next.

## Status

- [x] **Milestone 1 — core** (2026-10-27, lot 17): Modbus TCP read of one Solakon ONE (battery,
      solar, AC, EPS, temperature, energy counters guarded, control mode, forced power, timer,
      state of charge limits, EPS output), one device per serial number, control behind
      `allow_control`, return to automatic mode never behind it (held, never by time), docs en/fr,
      cover. Tested against a fake device only.
- [ ] **Review r1** (xhigh: energy, commandable).
- [ ] **Milestone 2 — real device**: run against a real one (see "To check"), turn register dumps
      into fixtures.
- [ ] **Milestone 3 — more**: grid export power limit (46616, 0–800 W), battery currents, alarms and
      status bits, BMS details, the energy drawn on AC (39625) once its kind is known; `keywords`
      and `countries` (DE) in the manifest.

## To check on a real device

- The sign of the AC power (39134): published signed as the device gives it.
- Whether 46001 reads back the code written at once, and 0 once the timer ran out.
- Whether writing 46002 again restarts the countdown (46007) of a forced mode already running.
- Whether the device keeps the forced power in 46005 too (the manufacturer's integration writes it).
- Whether the energy counters (39601–39621) ever read 0 or drop on a firmware update.
- How many Modbus clients the device accepts at once.

## Decisions

- **Version 0.1.0 set by hand** in `package.json`, `package-lock.json`, the manifest and
  `docker_image` (`ghcr.io/lm1lc3n7/gladys-solakon:0.1.0`); the first patch release gives 0.1.1.
  SDK 0.16.0 (latest published, 2026-10-27).
- **Reference**: solakon-one-homeassistant 1.7.0 (MIT, LICENSE in the name of Solakon GmbH, the
  manufacturer: its own integration, the manufacturer's documentation of the registers for the
  current firmware), commit fe6ad33 of 2026-09-21, cloned read only in
  `~/code/ref/lot17/solakon`. No separate Modbus document is published by Solakon. Notices in
  `THIRD_PARTY_NOTICES.md`, shipped in the image with `LICENSE`.
- **Reads** are exactly some of the batches the manufacturer's integration reads (same start, same
  count: `test/protocol.test.js`), so a device in the field answers them. Holding registers,
  function 3. Core blocks: identity, AC, battery, state of charge, remote control; optional:
  energy counters, settings (skipped after an "illegal data address" never answered before).
- **External id**: `solakon:<serial>` in upper case, from 30016-30031 (letters, digits, - and _,
  4 to 40). No fallback: without a readable serial nothing is published (a fallback id would make
  a second device the day the serial reads again). Another serial at the address is another device;
  commands carry the serial of their feature and are refused when another one answers. The stop is
  not: it goes to the address (it only ever ends a forced mode).
- **Writes** as the manufacturer's integration does: function 6 for 46001, 46002, 46609, 46610,
  46613; function 16 of two registers for 46003 and 46005. `writeRequest` refuses any other
  register or value (46001 only 0, 1, 3; 46002 60–3600 s; powers 0–1200; SoC 10–100; EPS 0, 2, 3).
- **Forced mode**: power (46003 and 46005 alike, lowered to 800 W for a discharge), then the timer
  (46002, the configured 1–60 minutes, never 0), then the mode (46001), in one session. The power
  of a forced mode is the one already in 46003 (absolute value), set with the "forced power"
  feature. Clicked again: the timer and the mode are written again.
- **Forced power** limit decided on 46001 read just before: 800 W when it is an enabled
  generation code (1, 5, 9, 13) or unknown, 1200 W otherwise.
- **SoC limits**: 10–100 % (the manufacturer's slider allows a maximum of 0; a maximum under the
  minimum would stop charging: refused), the minimum never above the maximum read just before.
- **EPS output**: every value sensitive (turning it off cuts the emergency socket): no protective.
- **Stop** (46001 = 0) after the lot rules: never ended by time; `from` (the forced code read
  before) in /data; written again every 15 s while the device shows `from`, an undocumented code or
  nothing; `from` unknown: the first forced code read becomes it (lot 17 r3 of Lambda); another
  forced code read twice in a row (2 s apart, nothing written between) lets go; a newer forced mode
  clicked with the option (its 46001 write left) lets go; automatic read lets go. Kept in /data
  before the first byte (a failed save never blocks it), written again at boot from /data
  without a read nor the configuration.
- **Energy**: indexes only from lifetime counters (no daily counter used): solar →
  `energy-production-sensor/index`; battery charged/discharged (battery side) →
  `battery-storage/charge-index` / `discharge-index`; delivered on AC (39621) →
  `home-output-sensor/index`; nothing ever in `energy-sensor/energy` nor `index`. The AC import
  (39625) is not published in v1. Guard of gladys-p1-monitor as is (constants 5 kW, 0.05 kWh):
  never 0, drops and jumps held, kept in /data, accepted with a two-press action bounded to the
  values listed. Wall clock for its dates (compared with `last_value_changed` of Gladys).
- **AC power** (39134): sign undocumented, so a signed `energy-sensor/power`, never home output
  nor grid. Battery power split into charge/discharge (sign from the manufacturer's README).
- **Units**: only those of `DEVICE_FEATURE_UNITS_BY_CATEGORY`; the forced power and SoC limits are
  `unknown` features (no unit there), their unit in their name.
