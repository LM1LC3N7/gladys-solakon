# Third-party notices

This integration is licensed under the Apache License 2.0 (see `LICENSE`). It
contains logic ported to JavaScript from the project below. The ported parts
were rewritten, not copied; the changes are described below.

## solakon-one-homeassistant

<https://github.com/solakon-de/solakon-one-homeassistant> (Home Assistant
custom integration "Solakon ONE", version 1.7.0, commit fe6ad33 of
2026-09-21), by Solakon GmbH, the manufacturer of the device. MIT License;
its `LICENSE` file names Solakon GmbH. Full text below.

Ported in `src/constants.js`, `src/modbus/protocol.js` and `src/model.js`:
the Modbus TCP register map of the Solakon ONE (`const.py`: model and serial
number 30000/30016, PV power 39118, AC voltage 39123, AC power 39134,
internal temperature 39141, EPS power 39216, battery power 39230, state of
charge 39424, energy counters 39601-39621 in 0.01 kWh, remote control
46001-46007, state of charge limits 46609/46610, EPS output 46613), the data
types (32-bit values high word first, strings high byte first), the read
batches (`compute_register_batches` of `modbus.py`: the blocks read here are
exactly some of its batches), the remote control codes ("Remote Control
Definition V1.5", `remote_control.py`, `select.py` ForceModeSelect: 0
disabled, 1 forced discharge, 3 forced charge), the forced power written to
46003 and 46005 alike (`number.py` ForcePowerNumber), the force duration in
46002, the discharge and charge limits of 800 W and 1200 W and the lowering
of a forced power above 800 W before a discharge (`power_limit.py`), the
sign of the battery power (README: > 0 discharges).

Changed: a forced mode always writes the timer (46002, 1 to 60 minutes,
never 0) before the mode; the writes are checked once more at the protocol
layer (registers and values Gladys writes only); the state of charge limits
are 10 to 100 % and the minimum is never written above the maximum read
just before; every command is decided on a fresh read and confirmed by a
read back; the return to automatic mode is never held back and is written
again until the device shows it. Nothing of Home Assistant itself is used.

```
MIT License

Copyright (c) 2025 Solakon GmbH

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Integrations of the same author (Apache-2.0)

- `src/modbus/client.js`, `src/publisher.js`, `src/handlers.js` and the
  shape of `src/app.js` (the line, the queue, the stops) come from
  gladys-idm (<https://github.com/LM1LC3N7/gladys-idm>).
- `src/guard.js` comes from gladys-p1-monitor
  (<https://github.com/LM1LC3N7/gladys-p1-monitor>), only its constants
  changed.

## gladys-testkit (tests only)

`test/kit/` is copied from gladys-testkit (Apache-2.0, same author as this
integration): fake TCP device and clocks, used by the tests only, not in the
image.
