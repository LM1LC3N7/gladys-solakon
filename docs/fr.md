# Solakon ONE (Modbus TCP)

Cette intégration affiche une batterie de balcon **Solakon ONE** dans Gladys,
lue sur votre réseau local par **Modbus TCP** (port 502), sans cloud. Elle
peut aussi la piloter, seulement si vous l’autorisez.

> **Jamais testé avec un vrai appareil.** Construit à partir de la table des
> registres que le fabricant publie dans sa propre intégration Home Assistant
> (solakon-one-homeassistant 1.7.0) et testé contre un appareil simulé.
> Non officiel, **sans lien avec Solakon**.

## Avant de commencer

1. Activez le **Modbus TCP** sur le Solakon ONE (application Solakon ou
   réglages de l’appareil) et donnez-lui une adresse IP fixe sur votre box.
2. Le Modbus TCP n’a **pas de mot de passe** : tout appareil de votre réseau
   peut lire et piloter la batterie. Gardez-la sur un **réseau de confiance**
   (aucune redirection de port vers internet).

## Configuration

| Champ                          | Rôle                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Adresse IP                     | L’adresse du Solakon ONE, port 502 sauf si vous en ajoutez un (`192.168.1.70:502`).                            |
| Identifiant d’unité Modbus     | En général 1.                                                                                                  |
| Autoriser le pilotage          | Désactivé par défaut : voir « Pilotage » plus bas.                                                             |
| Durée d’un mode forcé          | 1 à 60 minutes (15 par défaut), écrite dans la minuterie de l’appareil avant chaque charge ou décharge forcée. |
| Intervalle de rafraîchissement | Secondes entre deux lectures (30 par défaut, 10 au moins).                                                     |
| Langue                         | Noms de l’appareil et des fonctionnalités ajoutés désormais, statut et erreurs.                                |

Enregistrez, puis ajoutez l’appareil depuis l’onglet **Découverte**.
L’appareil est identifié par son **numéro de série** (relu à chaque lecture) :
si un autre Solakon ONE répond un jour à cette adresse, il apparaît comme un
autre appareil, et les commandes envoyées au premier sont refusées. Sans
numéro de série lisible, rien n’est publié (le statut le dit).

Le bouton **Tester la connexion** lit l’appareil une fois, jamais avant
l’intervalle de rafraîchissement depuis la dernière lecture (il affiche alors
le dernier résultat).

## Ce que vous obtenez

| Fonctionnalité                                                           | Catégorie Gladys                   | Remarque                                                                         |
| ------------------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------- |
| Niveau de la batterie                                                    | stockage, %                        |                                                                                  |
| Puissance de charge / de décharge                                        | stockage, W                        | toutes deux >= 0 (l’appareil donne une valeur signée : > 0 en décharge)          |
| Puissance solaire                                                        | production, W                      |                                                                                  |
| Énergie solaire                                                          | production, index (kWh)            | compteur à vie                                                                   |
| Énergie chargée / déchargée                                              | stockage, index (kWh)              | compteurs à vie, côté batterie                                                   |
| Énergie fournie en AC                                                    | sortie vers la maison, index (kWh) | compteur à vie                                                                   |
| Puissance AC à la prise                                                  | capteur d’énergie, W, **signée**   | le fabricant ne documente pas son signe : affichée telle que l’appareil la donne |
| Tension AC, puissance de la sortie de secours, température de l’appareil |                                    | quand l’appareil les donne                                                       |
| Mode de pilotage                                                         | liste                              | automatique, charge forcée, décharge forcée, autre (réglé par un autre outil)    |
| Puissance de charge/décharge forcée (W)                                  | nombre                             | la puissance d’un mode forcé                                                     |
| Temps restant du mode forcé                                              | durée, minutes                     | la minuterie de l’appareil                                                       |
| État de charge minimum / maximum (%)                                     | nombre                             |                                                                                  |
| Sortie de secours (EPS)                                                  | liste                              | désactivée, EPS, UPS                                                             |

Une valeur invraisemblable ou non lue reste inconnue, jamais publiée à 0 ni
comme une ancienne valeur. Si les compteurs d’énergie ou les réglages ne
répondent pas, les autres valeurs sont publiées quand même (le statut dit ce
qui n’a pas été lu) ; après 3 échecs de suite, ce bloc est sauté pendant 10
lectures.

### Compteurs d’énergie

Gladys compte chaque hausse d’un index comme de l’énergie. Les compteurs ne
sont donc **jamais publiés à 0** (un compteur qui ne compte pas), et une
**baisse** (remise à zéro, appareil remplacé) ou un **saut** plus grand que ce
que l’appareil peut faire est **retenu** : rien n’est publié pour ce compteur,
le statut dit lequel et ses valeurs, quel que soit le temps écoulé. Si c’est
réel, appuyez sur **Accepter les compteurs retenus** : un premier appui les
liste, un second dans les 2 minutes accepte exactement les valeurs listées
(un compteur qui a bougé entre-temps n’est pas accepté). Les autres compteurs
continuent.

## Pilotage

Désactivé par défaut. Avec **Autoriser le pilotage**, Gladys peut :

- **forcer une charge ou une décharge** (mode de pilotage). Avant le mode, il
  écrit toujours la **minuterie** de l’appareil (la durée de la
  configuration) : à son terme l’appareil revient seul en mode automatique,
  même si Gladys est arrêté. Recliquer le même mode forcé réécrit la
  minuterie. Une puissance forcée au-dessus de 800 W est ramenée à 800 W
  avant une décharge ;
- régler la **puissance forcée** (en watts entiers) : 800 W au plus quand une
  décharge est forcée ou peut l’être (autre mode distant réglé ailleurs, mode
  inconnu), 1200 W au plus sinon. Ce sont les limites du fabricant ; la
  puissance forcée est écrite dans les deux consignes de puissance de
  l’appareil, comme le fait l’intégration du fabricant ;
- régler les **états de charge minimum et maximum**, de 10 à 100 %, le minimum
  jamais au-dessus du maximum relu juste avant ;
- régler la **sortie de secours** (désactivée, EPS, UPS).

Chaque commande est vérifiée à son arrivée et de nouveau juste avant chaque
écriture (l’option, la configuration, un retour en mode automatique cliqué
entre-temps), décidée sur les valeurs relues juste avant sur l’appareil
cliqué (son numéro de série), et **confirmée seulement par une relecture**
montrant les valeurs demandées. Sinon Gladys répond « envoyée, sans
confirmation » (vérifiez dans quelques secondes) ou « non envoyée ». Les
commandes partent une à une, dans leur ordre ; une scène qui règle plusieurs
valeurs les règle toutes.

### Retour en mode automatique (l’arrêt)

Choisir **Automatique** dans le mode de pilotage arrête une charge ou une
décharge forcée. Cela **ne dépend pas de l’option**, ni d’une lecture en cours
(elle est interrompue), ni d’une commande en attente (l’arrêt passe devant ;
les commandes cliquées avant lui et pas encore parties sont abandonnées), ni
d’une lecture échouée, ni des bornes, ni d’une configuration que Gladys ne
peut pas encore lire (il part alors vers l’appareil de la dernière lecture).

Il n’est refusé que si Gladys ne connaît aucune adresse (aucune dans la
configuration, ou configuration illisible et aucun appareil jamais lu). Il
peut échouer si l’appareil est injoignable : la connexion est réessayée
pendant 3 s, puis Gladys répond « pas encore envoyé » et le garde.

Un arrêt pas encore vu appliqué est **gardé** (y compris après un
redémarrage : il est réécrit au démarrage, avant toute autre chose) et
vérifié toutes les 15 s : réécrit tant que l’appareil montre le mode forcé
qu’il remplace, un mode inconnu ou rien. Il n’est abandonné que si
l’appareil montre le mode automatique, si un autre mode forcé réglé ailleurs
est lu deux fois de suite après l’écriture de l’arrêt (un choix plus récent
est respecté ; un arrêt pas encore écrit n’est jamais abandonné ainsi : il est
d’abord écrit, quel que soit le mode affiché), si vous cliquez un mode
forcé dans Gladys (avec l’option), ou si un arrêt est cliqué pour une autre
adresse (après un changement de configuration). Il ne s’arrête jamais avec
le temps ; le statut indique qu’il est gardé. Pendant l’envoi d’un arrêt, un
mode forcé cliqué dans Gladys est refusé.

## Pas fait dans cette version

- La limite d’injection, les courants de la batterie, les alarmes et le
  détail des BMS que l’appareil donne aussi.
- L’énergie prise en AC (charge depuis la maison) : non publiée, la nature de
  ce compteur reste à confirmer.
- Un vrai appareil : le signe de la puissance AC, le décompte de la
  minuterie, et le fait que l’appareil garde la puissance forcée dans les deux
  consignes restent à confirmer.
