# Solakon ONE (Modbus TCP)

This integration shows a **Solakon ONE** plug-in (balcony) battery in Gladys,
read on your local network through **Modbus TCP** (port 502), without any
cloud. It can also control it, only if you allow it.

> **Never tested with a real device.** It was built from the register map
> the manufacturer publishes in its own Home Assistant integration
> (solakon-one-homeassistant 1.7.0) and tested against a simulated device.
> Unofficial, **not affiliated with Solakon**.

## Before you start

1. Enable **Modbus TCP** on the Solakon ONE (Solakon app or the device's
   settings) and give it a fixed IP address on your router.
2. Modbus TCP has **no password**: anyone on your network can read and
   control the device. Keep it on a **trusted network** (no port forwarding
   to the internet).

## Configuration

| Field                     | Meaning                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| IP address                | The address of the Solakon ONE, port 502 unless you add one (`192.168.1.70:502`).                            |
| Modbus unit id            | Usually 1.                                                                                                   |
| Allow the control         | Off by default: see "Control" below.                                                                         |
| Duration of a forced mode | 1 to 60 minutes (15 by default), written to the timer of the device before every forced charge or discharge. |
| Refresh interval          | Seconds between two reads (30 by default, 10 at least).                                                      |
| Language                  | Names of the device and features added from now on, status and errors.                                       |

Save, then add the device from the **Discovery** tab. The device is keyed on
its **serial number** (read at every read): if another Solakon ONE answers at
the address one day, it shows as another device, and the commands sent to the
first one are refused. Without a readable serial number nothing is published
(the status says so).

The **Test the connection** button reads the device once, never sooner than
the refresh interval after the last read (it then shows the last result).

## What you get

| Feature                                          | Gladys category                | Note                                                                      |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------- |
| Battery level                                    | battery storage, %             |                                                                           |
| Battery charge / discharge power                 | battery storage, W             | both >= 0 (the device gives one signed value: > 0 discharges)             |
| Solar power                                      | energy production, W           |                                                                           |
| Solar energy                                     | energy production, index (kWh) | lifetime counter                                                          |
| Battery charged / discharged energy              | battery storage, index (kWh)   | lifetime counters, battery side                                           |
| Energy delivered on AC                           | home output, index (kWh)       | lifetime counter                                                          |
| AC power at the plug                             | energy sensor, W, **signed**   | the manufacturer does not document its sign: shown as the device gives it |
| AC voltage, EPS output power, device temperature |                                | when the device gives them                                                |
| Control mode                                     | selection                      | automatic, forced charge, forced discharge, other (set by another tool)   |
| Forced charge/discharge power (W)                | number                         | the power of a forced mode                                                |
| Forced mode time left                            | duration, minutes              | the timer of the device                                                   |
| Minimum / maximum state of charge (%)            | number                         |                                                                           |
| EPS output                                       | selection                      | disabled, EPS, UPS                                                        |

A value that is implausible or not read is left unknown, never published as
0 or as an old value.

### Energy counters

Gladys counts every rise of an index as energy. So the counters are
**never published at 0** (a counter that does not count), and a **drop**
(reset, device replaced) or a **jump** larger than the device can move is
**held back**: nothing is published for that counter, the status says which
one and its values, whatever the time. If it is real, press **Accept the held
counters**: the first press lists them, a second press within 2 minutes
accepts exactly the values listed (a counter that moved in between is not
accepted). The other counters go on.

## Control

Off by default. With **Allow the control** on, Gladys may:

- **force a charge or a discharge** (control mode). Before the mode, it
  always writes the **timer** of the device (the duration of the
  configuration): at its end the device goes back to automatic mode by
  itself, even if Gladys is down. Clicking the same forced mode again
  writes the timer again. A forced power above 800 W is lowered to 800 W before
  a discharge;
- set the **forced power** (whole watts): 800 W at most while a discharge is
  forced or may be (another remote mode set elsewhere, mode unknown),
  1200 W at most otherwise. These are the limits of the manufacturer; the
  forced power is written to both power setpoints of the device, as the
  manufacturer's integration does;
- set the **minimum and maximum state of charge**, 10 to 100 %, the minimum
  never above the maximum read just before;
- set the **EPS output** (disabled, EPS, UPS).

Every command is checked on its arrival and again right before each write
(the option, the configuration, a return to automatic mode clicked
meanwhile), decided on the values read just before from the device clicked
(its serial number), and **confirmed only by a read back** showing the values
asked. Otherwise Gladys says "sent, without confirmation" (check in a few
seconds) or "not sent". Commands go one at a time, in their order; a scene
setting several values sets them all.

### Back to automatic mode (the stop)

Choosing **Automatic** in the control mode stops a forced charge or
discharge. It **does not depend on the option**, nor on a read in progress
(it ends it), a command waiting (it goes first; the commands clicked before
it and not sent yet are dropped), a failed read, the bounds, nor a configuration Gladys
cannot read yet (it then goes to the device of the last read).

It is refused only when Gladys knows no address at all (none in the
configuration, or the configuration cannot be read and no device was ever
read). It can fail when the device cannot be reached: the connection is
tried again for 3 s, then Gladys answers "not sent yet" and keeps it.

A stop not seen applied is **kept** (also across a restart: it is written
again at the start, before anything else) and checked every 15 s: written
again while the device shows the forced mode it replaced, an unknown mode or
nothing. It is let go only when the device shows automatic mode, when
another forced mode set elsewhere is read twice in a row (a newer choice is
respected), or when you click a forced mode in Gladys (with the option). It
never ends by time; the status says it is held. While a stop is being sent,
a forced mode clicked in Gladys is refused.

## Not done in this version

- The grid export limit, the battery currents, the alarms and the BMS
  details the device also gives.
- The energy drawn on AC (charging from the home): not published, its kind
  of counter is to be confirmed.
- A real device: the AC power sign, the countdown of the timer, and whether
  the device keeps the forced power in both setpoints are to be confirmed.
