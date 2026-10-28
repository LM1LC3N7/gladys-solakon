# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Fixed

- The counter guard keeps the value you accepted as a floor: after an
  accepted drop, a reading lower still is held (never counted without
  a new click) and the real value that follows is taken instead of being
  held as a jump; a reading back under an accepted jump is now held too and
  needs a new click.

## [0.1.1] - 2026-10-27

### Added

- The Solakon ONE plug-in battery over local Modbus TCP: battery level, charge and discharge
  power, solar power, AC power (signed), AC voltage, EPS output power, device temperature, the
  energy counters (solar, battery charged and discharged, delivered on AC), the control mode,
  the forced power and the time left of a forced mode, the state of charge limits, the EPS output.
- Control behind "Allow the control" (off by default): forced charge or discharge with the
  timer of the device always written first (1 to 60 minutes), forced power (800 W of discharge,
  1200 W of charge at most), minimum and maximum state of charge (10 to 100 %), EPS output;
  decided on a fresh read, confirmed by a read back.
- Going back to automatic mode never depends on that option; not seen applied, it is written
  again every 15 s and after a restart, until the device shows it or another mode set elsewhere
  is read twice in a row.
- The energy counters are never published at 0, nor after a drop or a jump, until the user
  accepts them ("Accept the held counters", two presses).
- "Test the connection" button, docs in English and French, cover image.

[Unreleased]: https://github.com/LM1LC3N7/gladys-solakon/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-solakon/releases/tag/v0.1.1
