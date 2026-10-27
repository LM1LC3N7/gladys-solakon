// -----------------------------------------------------------------------------
// Runtime texts (English and French): device, feature and option names, the
// status of the integration, the answers of the buttons and the command errors.
// -----------------------------------------------------------------------------

import { POWER, ROLE as R, SOC_BOUNDS } from './constants.js';

const both = (en, fr) => ({ en, fr });

/** One language of a `{ en, fr }` text. */
export const word = (value, language) => (language === 'en' ? value.en : value.fr);

/** Two texts one after the other, in both languages. */
export const join = (a, b) => both(`${a.en} ${b.en}`, `${a.fr} ${b.fr}`);

/** "45 s", "5 min", "2 h", in both languages. */
export function age(ms) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 90) return both(`${seconds} s`, `${seconds} s`);
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return both(`${minutes} min`, `${minutes} min`);
  const hours = Math.round(minutes / 60);
  return both(`${hours} h`, `${hours} h`);
}

export const DEVICE_NAME = both('Solakon ONE', 'Solakon ONE');

export const FEATURE_NAMES = {
  [R.BATTERY_LEVEL]: both('Battery level', 'Niveau de la batterie'),
  [R.CHARGE_POWER]: both('Battery charge power', 'Puissance de charge de la batterie'),
  [R.DISCHARGE_POWER]: both('Battery discharge power', 'Puissance de décharge de la batterie'),
  [R.CHARGE_INDEX]: both('Battery charged energy', 'Énergie chargée dans la batterie'),
  [R.DISCHARGE_INDEX]: both('Battery discharged energy', 'Énergie déchargée de la batterie'),
  [R.SOLAR_POWER]: both('Solar power', 'Puissance solaire'),
  [R.SOLAR_INDEX]: both('Solar energy', 'Énergie solaire'),
  [R.AC_POWER]: both(
    'AC power at the plug (W, sign as the device gives it)',
    'Puissance AC à la prise (W, signe donné par l’appareil)',
  ),
  [R.AC_OUTPUT_INDEX]: both('Energy delivered on AC', 'Énergie fournie en AC'),
  [R.AC_VOLTAGE]: both('AC voltage', 'Tension AC'),
  [R.EPS_POWER]: both('EPS output power', 'Puissance de la sortie de secours (EPS)'),
  [R.TEMPERATURE]: both('Device temperature', 'Température de l’appareil'),
  [R.CONTROL_MODE]: both('Control mode', 'Mode de pilotage'),
  [R.FORCE_POWER]: both('Forced charge/discharge power', 'Puissance de charge/décharge forcée'),
  [R.FORCE_REMAINING]: both('Forced mode time left', 'Temps restant du mode forcé'),
  [R.MIN_SOC]: both('Minimum state of charge', 'État de charge minimum'),
  [R.MAX_SOC]: both('Maximum state of charge', 'État de charge maximum'),
  [R.EPS_MODE]: both('EPS output', 'Sortie de secours (EPS)'),
};

export const CONTROL_MODE_NAMES = {
  auto: both('Automatic (the device decides)', 'Automatique (l’appareil décide)'),
  charge: both('Forced charge', 'Charge forcée'),
  discharge: both('Forced discharge', 'Décharge forcée'),
  other: both('Other remote mode (set elsewhere)', 'Autre mode distant (réglé ailleurs)'),
};

export const EPS_MODE_NAMES = {
  off: both('Disabled', 'Désactivée'),
  eps: both('EPS', 'EPS'),
  ups: both('UPS', 'UPS (onduleur)'),
};

const counterName = (role) => FEATURE_NAMES[role];

export const T = {
  noHost: both(
    'Enter the IP address of the Solakon ONE in the configuration.',
    'Saisissez l’adresse IP du Solakon ONE dans la configuration.',
  ),
  invalid: (length) =>
    both(
      `The address typed (${length} characters) is not a valid IPv4 address or host name.`,
      `L’adresse saisie (${length} caractères) n’est pas une adresse IPv4 ou un nom d’hôte valide.`,
    ),
  badUnitId: both(
    'The Modbus unit id must be a whole number from 1 to 247.',
    'L’identifiant d’unité Modbus doit être un nombre entier de 1 à 247.',
  ),
  configUnreadable: both(
    'The configuration could not be read from Gladys: tried again every 30 s.',
    'La configuration n’a pas pu être lue depuis Gladys : nouvel essai toutes les 30 s.',
  ),
  connecting: both('Connecting to the Solakon ONE…', 'Connexion au Solakon ONE…'),
  waiting: (wait) =>
    both(
      `Next read in ${wait.en} (never sooner than the refresh interval).`,
      `Prochaine lecture dans ${wait.fr} (jamais avant l’intervalle de rafraîchissement).`,
    ),
  lastRead: (ago) => both(`Last read ${ago.en} ago.`, `Dernière lecture il y a ${ago.fr}.`),
  unreachable: (address, wait) =>
    both(
      `The Solakon ONE at ${address} does not answer (is Modbus TCP enabled?). Next try in ${wait.en}.`,
      `Le Solakon ONE à ${address} ne répond pas (le Modbus TCP est-il activé ?). Nouvel essai dans ${wait.fr}.`,
    ),
  failing: (reason, wait) =>
    both(
      `Reading the Solakon ONE failed (${reason}). Next try in ${wait.en}.`,
      `La lecture du Solakon ONE a échoué (${reason}). Nouvel essai dans ${wait.fr}.`,
    ),
  noSerial: both(
    'The device answers but its serial number cannot be read: nothing is published (the device is keyed on it).',
    'L’appareil répond mais son numéro de série est illisible : rien n’est publié (l’appareil est identifié par lui).',
  ),
  connected: (serial, values) => {
    const parts = [];
    if (values[R.BATTERY_LEVEL] !== undefined) parts.push(`${values[R.BATTERY_LEVEL]} %`);
    if (values[R.SOLAR_POWER] !== undefined) parts.push(`PV ${values[R.SOLAR_POWER]} W`);
    const mode = values[R.CONTROL_MODE];
    return both(
      `Connected to the Solakon ONE ${serial}${parts.length ? ` (${parts.join(', ')})` : ''}${mode ? `, control: ${CONTROL_MODE_NAMES[mode].en}` : ''}.`,
      `Connecté au Solakon ONE ${serial}${parts.length ? ` (${parts.join(', ')})` : ''}${mode ? `, pilotage : ${CONTROL_MODE_NAMES[mode].fr}` : ''}.`,
    );
  },
  missingBlocks: (keys) => both(`Not read this time: ${keys}.`, `Non lus cette fois : ${keys}.`),
  stopHeld: (since) =>
    both(
      `A return to automatic mode clicked ${since.en} ago is not seen applied yet: written again every 15 s until the device shows it, or until another mode set elsewhere is read twice in a row.`,
      `Un retour en mode automatique cliqué il y a ${since.fr} n’est pas encore vu appliqué : réécrit toutes les 15 s jusqu’à ce que l’appareil l’affiche, ou qu’un autre mode réglé ailleurs soit lu deux fois de suite.`,
    ),
  counterHeld: (role, held) =>
    both(
      `${counterName(role).en}: ${held.direction === 'down' ? 'dropped' : 'jumped'} from ${held.from} to ${held.to} kWh (reset, replacement or glitch?): not published; press "Accept the held counters" if it is real.`,
      `${counterName(role).fr} : ${held.direction === 'down' ? 'baisse' : 'saut'} de ${held.from} à ${held.to} kWh (remise à zéro, remplacement ou erreur ?) : non publié ; appuyez sur « Accepter les compteurs retenus » si c’est réel.`,
    ),
  otherDevice: (serial) =>
    both(
      `Another Solakon ONE answers at this address now (serial ${serial}).`,
      `Un autre Solakon ONE répond maintenant à cette adresse (numéro ${serial}).`,
    ),
  accept: {
    nothing: both(
      'No counter is held: nothing to accept.',
      'Aucun compteur retenu : rien à accepter.',
    ),
    confirm: (list) =>
      both(
        `Held: ${list.map((c) => `${counterName(c.role).en} ${c.from} → ${c.to} kWh`).join('; ')}. Press again within 2 minutes to accept exactly these values.`,
        `Retenus : ${list.map((c) => `${counterName(c.role).fr} ${c.from} → ${c.to} kWh`).join(' ; ')}. Appuyez de nouveau dans les 2 minutes pour accepter exactement ces valeurs.`,
      ),
    done: (accepted, skipped) =>
      both(
        `Accepted: ${accepted.map((r) => counterName(r).en).join(', ') || 'none'}${skipped.length ? `; changed since the first press, not accepted: ${skipped.map((r) => counterName(r).en).join(', ')}` : ''}.${accepted.length ? ' Published at the next read.' : ''}`,
        `Acceptés : ${accepted.map((r) => counterName(r).fr).join(', ') || 'aucun'}${skipped.length ? ` ; changés depuis le premier appui, non acceptés : ${skipped.map((r) => counterName(r).fr).join(', ')}` : ''}.${accepted.length ? ' Publiés à la prochaine lecture.' : ''}`,
      ),
  },
};

export const ERRORS = {
  readOnly: both('This feature is read only.', 'Cette fonctionnalité est en lecture seule.'),
  badValue: both('Not one of the choices: not sent.', 'Pas un des choix proposés : non envoyée.'),
  notWritable: both(
    'This mode is shown only, Gladys never sets it: not sent.',
    'Ce mode est seulement affiché, Gladys ne le règle jamais : non envoyé.',
  ),
  badNumber: both('Not a whole number: not sent.', 'Ce n’est pas un nombre entier : non envoyé.'),
  powerRange: (max, discharge) =>
    both(
      `Out of range (0 to ${max} W${discharge ? `: ${POWER.maxDischarge} W at most while a discharge is or may be forced` : ''}): not sent.`,
      `Hors limites (0 à ${max} W${discharge ? ` : ${POWER.maxDischarge} W au plus quand une décharge est ou peut être forcée` : ''}) : non envoyé.`,
    ),
  socRange: both(
    `Out of range (${SOC_BOUNDS.min} to ${SOC_BOUNDS.max} %): not sent.`,
    `Hors limites (${SOC_BOUNDS.min} à ${SOC_BOUNDS.max} %) : non envoyé.`,
  ),
  socOrder: (min, max) =>
    both(
      `The minimum state of charge (${min} %) would be above the maximum (${max} %): not sent.`,
      `L’état de charge minimum (${min} %) serait au-dessus du maximum (${max} %) : non envoyé.`,
    ),
  disabled: both(
    'Control is disabled: turn on "Allow the control" in the configuration of the integration.',
    'Le pilotage est désactivé : activez « Autoriser le pilotage » dans la configuration de l’intégration.',
  ),
  noHost: both(
    'No valid address or Modbus unit id in the configuration: not sent.',
    'Aucune adresse ou identifiant d’unité Modbus valide dans la configuration : non envoyée.',
  ),
  otherDevice: both(
    'Another device (another serial number) answers at the address of the configuration: not sent.',
    'Un autre appareil (autre numéro de série) répond à l’adresse de la configuration : non envoyée.',
  ),
  unknownIdentity: both(
    'The serial number of the device could not be read just before: not sent.',
    'Le numéro de série de l’appareil n’a pas pu être relu juste avant : non envoyée.',
  ),
  unknownValue: both(
    'The current values could not be read just before: command not sent.',
    'Les valeurs actuelles n’ont pas pu être relues juste avant : commande non envoyée.',
  ),
  stopPending: both(
    'Return to automatic mode not sent yet, still trying to reach the device: it is tried again every 15 s; check its state in a few seconds.',
    'Retour en mode automatique pas encore envoyé, l’appareil est encore en cours de connexion : nouvel essai toutes les 15 s ; vérifiez son état dans quelques secondes.',
  ),
  stopRunning: both(
    'A return to automatic mode is under way: a forced mode is refused until it is done.',
    'Un retour en mode automatique est en cours : un mode forcé est refusé jusqu’à sa fin.',
  ),
  configChanged: both(
    'The configuration changed meanwhile: not sent.',
    'La configuration a changé entre-temps : non envoyée.',
  ),
  busy: both(
    'Too many commands are waiting for the device: not sent.',
    'Trop de commandes attendent l’appareil : non envoyée.',
  ),
  protectMeanwhile: both(
    'A return to automatic mode was clicked meanwhile: not sent.',
    'Un retour en mode automatique a été cliqué entre-temps : non envoyée.',
  ),
  tooSlow: both(
    'The device answered too slowly to send the command in time: not sent.',
    'L’appareil a répondu trop lentement pour envoyer la commande à temps : non envoyée.',
  ),
  unknownState: (reason) =>
    both(
      `The current values could not be read just before (${reason}): command not sent.`,
      `Les valeurs actuelles n’ont pas pu être relues juste avant (${reason}) : commande non envoyée.`,
    ),
  refused: (reason) =>
    both(
      `The device refused the command (${reason}): not applied.`,
      `L’appareil a refusé la commande (${reason}) : non appliquée.`,
    ),
  notSent: (reason) =>
    both(
      `The device could not be reached (${reason}): command not sent.`,
      `L’appareil n’a pas pu être joint (${reason}) : commande non envoyée.`,
    ),
  sentUnconfirmed: (reason) =>
    both(
      `Command sent, without confirmation (${reason}): check the state of the device in a few seconds.`,
      `Commande envoyée, sans confirmation (${reason}) : vérifiez l’état de l’appareil dans quelques secondes.`,
    ),
  queued: both(
    'Command waiting its turn behind other commands (a scene): it is sent within 15 s of the click, or not at all; check the state of the device in a few seconds.',
    'Commande en attente derrière d’autres commandes (une scène) : elle part dans les 15 s qui suivent le clic, ou pas du tout ; vérifiez l’état de l’appareil dans quelques secondes.',
  ),
  rejected: (register) => both(`${register} refused`, `${register} refusé`),
  written: (list) => both(`registers written: ${list}`, `registres écrits : ${list}`),
  noAnswerYet: both('no answer yet', 'pas encore de réponse'),
  readBackDiffers: both(
    'the values read back are not the ones asked',
    'les valeurs relues ne sont pas celles demandées',
  ),
};
