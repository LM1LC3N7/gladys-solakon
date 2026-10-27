// -----------------------------------------------------------------------------
// Solakon ONE constants: the Modbus TCP map, manifest keys, feature roles,
// limits and timings.
//
// The Solakon ONE answers Modbus TCP on port 502 (unit id 1 by default) once
// Modbus TCP is enabled on it, without authentication. Every register below
// is the manufacturer's own: solakon-one-homeassistant 1.7.0 (MIT, Solakon
// GmbH, `custom_components/solakon_one/const.py`, `remote_control.py`
// "Remote Control Definition V1.5", `power_limit.py`), the integration
// Solakon publishes for its device. Only these requests are ever sent:
//   - read holding registers (function 3) of the blocks below, each block
//     one of the very batches the manufacturer's integration reads (same
//     start, same count: `compute_register_batches` of its modbus.py, gap 10,
//     125 registers at most), so a device in the field is known to answer them;
//   - write single register (function 6) at 46001 (remote control), 46002
//     (remote timeout), 46609/46610 (minimum/maximum state of charge) and
//     46613 (EPS output), write multiple registers (function 16) of two
//     registers at 46003 (remote active power) and 46005 (remote reactive
//     power), as the manufacturer's integration writes them.
//
// Data types (const.py): u16/i16 one register; u32/i32 two registers, high
// word first; strings two ASCII characters per register, high byte first.
// -----------------------------------------------------------------------------

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

export const DEFAULT_PORT = 502;
export const UNIT_ID = { min: 1, max: 247, default: 1 };
/** Seconds between two reads (the manufacturer's integration reads every 30 s). */
export const POLL_INTERVAL = { min: 10, max: 3600, default: 30 };

/** Modbus function codes used (nothing else is ever sent). */
export const FC = {
  READ_HOLDING: 0x03,
  WRITE_SINGLE: 0x06,
  WRITE_MULTIPLE: 0x10,
};

/** The MBAP header (7 bytes) and the largest frame Modbus TCP allows (260 bytes). */
export const MBAP_SIZE = 7;
export const MAX_FRAME = 260;

/** Modbus exception "illegal data address". */
export const ILLEGAL_DATA_ADDRESS = 2;
/** Exceptions after which the device did not apply a write (illegal function, address, value). */
export const NOT_APPLIED_EXCEPTIONS = new Set([1, 2, 3]);

/**
 * The blocks read, in this order (the core ones first: a silent optional block
 * ends the session, the core values already read are kept): `[address, type, key, scale]` points
 * inside one read of `count` registers from `address` (the manufacturer's
 * batches). `core`: an exception on it fails the read; an optional block
 * refused with "illegal data address" before it was ever answered is not
 * served by this firmware (not read again until a restart).
 */
export const BLOCKS = [
  {
    key: 'identity',
    core: true,
    address: 30000,
    count: 48,
    points: [
      [30000, 'string16', 'model'],
      [30016, 'string16', 'serial'],
    ],
  },
  {
    key: 'ac',
    core: true,
    address: 39118,
    count: 35,
    points: [
      [39118, 'i32', 'pvPower'],
      [39123, 'i16', 'acVoltage', 10],
      [39134, 'i32', 'acPower'],
      [39141, 'i16', 'temperature', 10],
    ],
  },
  {
    key: 'battery',
    core: true,
    address: 39216,
    count: 16,
    points: [
      [39216, 'i32', 'epsPower'],
      [39230, 'i32', 'batteryPower'],
    ],
  },
  {
    key: 'soc',
    core: true,
    address: 39424,
    count: 1,
    points: [[39424, 'i16', 'soc']],
  },
  {
    key: 'remote',
    core: true,
    address: 46001,
    count: 7,
    points: [
      [46001, 'u16', 'remoteControl'],
      [46002, 'u16', 'remoteTimeout'],
      [46003, 'i32', 'remotePower'],
      [46005, 'i32', 'remoteReactive'],
      [46007, 'u16', 'remoteCountdown'],
    ],
  },
  {
    key: 'energy',
    address: 39601,
    count: 26,
    points: [
      [39601, 'u32', 'pvEnergy', 100],
      [39605, 'u32', 'chargeEnergy', 100],
      [39609, 'u32', 'dischargeEnergy', 100],
      [39621, 'u32', 'acExportEnergy', 100],
    ],
  },
  {
    key: 'settings',
    address: 46607,
    count: 11,
    points: [
      [46609, 'u16', 'minSoc'],
      [46610, 'u16', 'maxSoc'],
      [46613, 'u16', 'epsOutput'],
    ],
  },
];

export const blockOf = (key) => BLOCKS.find((b) => b.key === key);

/** The largest read (Modbus allows 125 registers). */
export const MAX_READ = 125;

/** Remote control register 46001 (Remote Control Definition V1.5). */
export const REG = {
  REMOTE_CONTROL: 46001,
  REMOTE_TIMEOUT: 46002,
  REMOTE_POWER: 46003,
  REMOTE_REACTIVE: 46005,
  MIN_SOC: 46609,
  MAX_SOC: 46610,
  EPS_OUTPUT: 46613,
};

/**
 * The remote control modes Gladys writes: 0 disables the remote control (the
 * device runs on its own again: the stop), 1 "force discharge" and 3 "force
 * charge" (the manufacturer's ForceModeSelect: target AC, PV priority).
 * Bit 0 enables, bit 1 is the direction (0 generation/discharge, 1
 * consumption/charge), bits 3:2 the target; other enabled codes (5 to 15)
 * are set by other tools: shown as "other", never written.
 */
export const CONTROL_MODES = { auto: 0, discharge: 1, charge: 3 };
/** EPS output (46613): 0 disabled, 2 EPS, 3 UPS. */
export const EPS_MODES = { off: 0, eps: 2, ups: 3 };

/**
 * Power bounds of the manufacturer (power_limit.py): never more than 800 W
 * of discharge (the limit of a plug-in device in Germany), never more than
 * 1200 W of charge. A forced power is written to 46003 and 46005 alike.
 */
export const POWER = { maxDischarge: 800, maxCharge: 1200 };
/** The remote timeout written before every forced mode, in minutes (never 0: no timer). */
export const FORCE_MINUTES = { min: 1, max: 60, default: 15 };
/** State of charge limits Gladys may write (%). */
export const SOC_BOUNDS = { min: 10, max: 100 };

/** Manifest actions. */
export const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  ACCEPT_COUNTERS: 'accept_held_counters',
};

/**
 * Feature roles: the last part of the feature external ids, published
 * forever: never rename one.
 */
export const ROLE = {
  BATTERY_LEVEL: 'battery-level',
  CHARGE_POWER: 'charge-power',
  DISCHARGE_POWER: 'discharge-power',
  CHARGE_INDEX: 'charge-index',
  DISCHARGE_INDEX: 'discharge-index',
  SOLAR_POWER: 'solar-power',
  SOLAR_INDEX: 'solar-index',
  AC_POWER: 'ac-power',
  AC_OUTPUT_INDEX: 'ac-output-index',
  AC_VOLTAGE: 'ac-voltage',
  EPS_POWER: 'eps-power',
  TEMPERATURE: 'temperature',
  CONTROL_MODE: 'control-mode',
  FORCE_POWER: 'force-power',
  FORCE_REMAINING: 'force-remaining',
  MIN_SOC: 'min-soc',
  MAX_SOC: 'max-soc',
  EPS_MODE: 'eps-mode',
};

/** The lifetime counters (kWh), guarded before they reach Gladys (src/guard.js). */
export const COUNTERS = [
  ROLE.SOLAR_INDEX,
  ROLE.CHARGE_INDEX,
  ROLE.DISCHARGE_INDEX,
  ROLE.AC_OUTPUT_INDEX,
];
/** A counter never rises faster than this on average (the device moves 2.4 kW at most). */
export const COUNTER_MAX_KW = 5;
/** kWh always accepted on top (registers in 0.01 kWh, a late read). */
export const COUNTER_SLACK_KWH = 0.05;

export const LIMITS = {
  /** Gladys accepts 300 states a minute for the whole integration. */
  statesPerMinute: 300,
  statesPerRequest: 100,
  /** Commands waiting in the queue at most. */
  queue: 16,
  /** An optional block failing this many reads in a row is skipped for the next 10 reads. */
  optionalFailures: 3,
  optionalSkip: 10,
};

export const TIMINGS = {
  /** Opening the TCP connection of a poll. */
  connectTimeout: 3 * SECOND,
  /** A session closed gracefully waits this long for the device to close its side. */
  closeWait: 500,
  /** One answer. */
  requestTimeout: 2 * SECOND,
  /** A refused connection of a stop is tried again this often, until its deadline. */
  connectRetry: 250,
  /** Failed reads: 30 s, 1, 2, then 5 minutes, never shorter than the interval. */
  backoff: [30 * SECOND, MINUTE, 2 * MINUTE, 5 * MINUTE],
  /** The time of the last read goes to /data at most once a minute. */
  attemptWriteEvery: MINUTE,
  /** The publisher sends what is pending every second; unchanged states again every 30 min. */
  flushInterval: SECOND,
  stateHeartbeat: 30 * MINUTE,
  /**
   * Gladys waits 5 s for the ack: every click is answered by 3.5 s (a command
   * or a stop still running goes on, and the answer says what is known); a
   * stop is tried (connection refused, closed, timeout) until 3 s after its
   * click.
   */
  commandSendBy: 3_000,
  commandAnswerBy: 3_500,
  commandConnectMax: 2_000,
  commandReadMax: 1_500,
  commandMinRead: 300,
  commandMinSend: 300,
  /** A command waiting its turn (a scene setting several values) starts within 15 s, or never. */
  queueWindow: 15 * SECOND,
  /** The configuration could not be read from Gladys: tried again this often, forever. */
  configRetry: 30 * SECOND,
  /** Reads after a command: its effect, then a check. */
  followUps: [5 * SECOND, 20 * SECOND],
  /** A stop is written again only once the device had the time to apply it. */
  applyDelay: 5 * SECOND,
  /** The stop waits this long at most for /data before its first byte (a stuck disk never holds it). */
  stopSaveWait: 200,
  /** A stop not seen applied is checked this often (read, then written again), never ended by time. */
  stopRetry: 15 * SECOND,
  /** A value set elsewhere after a stop is read again this soon: two reads in a row let the stop go. */
  holdConfirm: 2 * SECOND,
  /** A check that gave its turn up to a click or a command is tried again this soon. */
  checkYield: SECOND,
  /** Last values older than this are never sent again to Gladys (connected, device created). */
  freshFor: 2 * MINUTE,
  /** The second click of "Accept the held counters" must come within this. */
  acceptWindow: 2 * MINUTE,
};
