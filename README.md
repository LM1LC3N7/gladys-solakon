# gladys-solakon

[Gladys Assistant](https://gladysassistant.com) external integration for the **Solakon ONE**
plug-in (balcony) battery, through its **Modbus TCP** interface on the local network (port 502, no
cloud, no password): battery level, charge and discharge power, solar power, AC power, EPS output,
energy counters (guarded), control mode; forced charge or discharge, forced power, state of charge
limits and EPS output behind an off-by-default option (800 W of discharge and 1200 W of charge at
most, the timer of the device always written before a forced mode), the return to automatic mode
never behind that option. **Never tested with a real device. Not affiliated with Solakon.** Modbus
TCP has no authentication: keep the device on a trusted network.

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/handlers.js ⇄ src/app.js (SolakonApp)
                                  ├─ src/modbus/client.js    one Modbus TCP session at a time, bounded MBAP frames
                                  ├─ src/modbus/protocol.js  blocks, requests, types, bounded writes (pure)
                                  ├─ src/model.js            plausible ranges, signs, mode codes (pure)
                                  ├─ src/devices.js          the device, its commands and states (pure)
                                  ├─ src/guard.js            lifetime counters: no 0, no drop, no jump (pure)
                                  ├─ src/publisher.js        states within 300/min
                                  └─ src/store.js            /data/solakon-state.json (last read, stop, counters)
```

- **Reads**: one connection per poll (every 30 s, 10 s – 1 h), function 3 on exactly some of the
  read batches of the manufacturer's own integration, the serial number first, then closed. The
  test button, Discovery, a reconnection and a restart never read sooner than the interval (time
  kept in `/data` before the read); only a command and the reads 5 s and 20 s after it do.
- **Device**: `ext:<selector>:solakon:<SERIAL>` (serial number in 30016-30031, frozen rule).
- **Commands** (`allow_control`, off by default): forced charge (46001 = 3) or discharge (1) with
  the timer (46002) written first and the forced power (46003/46005) lowered to 800 W before a
  discharge; forced power (800/1200 W); minimum and maximum state of charge (46609/46610, 10–100 %);
  EPS output (46613). Fresh read with the serial number, writes checked again at the protocol
  layer, echo and read back; one at a time in order on one session.
- **Stop** (protective): 46001 = 0 (automatic mode); never behind the option, the bounds, a read or
  a command; drops every command that arrived before; retried for 3 s; kept in `/data` with the mode
  it replaced and checked every 15 s, never ended by time: let go on automatic mode read, on another
  forced mode read twice in a row, or on a newer forced mode clicked; written again at a restart
  before the configuration is read.

## Development

```bash
npm install
npm test
npm run lint && npm run format:check
gi ci          # the whole CI locally (VM tooling)
```

Register map: [solakon-one-homeassistant](https://github.com/solakon-de/solakon-one-homeassistant)
1.7.0 by Solakon GmbH (MIT, see `THIRD_PARTY_NOTICES.md`).

## License

Apache-2.0, see [LICENSE](LICENSE).
