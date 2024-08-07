# Combat Exhaustion
This module is a simple one, for D&D5e, that adds exhaustion to a player depending on the setting to apply exhaustion.
The three options are:
- Apply During Combat
- Apply After Combat (Default)
- Always

## Exhaustion Modes
### Apply During Combat
Whenever a player gains HP from the unconsious state, during combat, 1 level of exhaustion is applied instantly. (Downs do not count outside of combat)

### Apply After Combat
Whenever a player gains HP from the unconsious state, during combat, 1 level of exhaustion is added to a tracker and the all those levels in the tracker are added at the end of combat. (Downs do not tracked outside of combat)

### Always
Whenever a player gains HP from the unconsious state, regardless of being in combat or not, they will receive 1 level of exhaustion

## Exhaustion on Death Fail
If this option is selected instead of a level of exhaustion being added on a down. The exhaustion is instead added when the player fails their first death save. This option runs in conjunction with the exhaustion mode that is chosen. (eg. After combat will count amount of first death fails in current combat then add at the end)

## DC for Exhaustion
When this setting is enabled whenever you would gain a level of exhaustion, a Constitution (CON) Save is intiated. This CON Save DC is et by the DM in the settings. If failed will add 1 level of exhaustion.

### Single Check After Combat
When this setting is enabled instead of asking for a CON Save per down during combat, stacks the tracker and adds it to the base value to a save at the end of cmbat. (Only adds one level of exhaustion at end of combat on a fail)

## License
Combat Exhaustion is released under the [MIT License](./LICENSE).

## Contact
For issues, please raise a bug in Github giving as much detail as you can. I will try and fix things as quickly as possible [https://github.com/ReAcTiOnN77/combat-exhaustion/issues](https://github.com/ReAcTiOnN77/combat-exhaustion/issues)
