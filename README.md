# Combat Exhaustion
This module is a simple one, for D&D5e, that adds exhaustion to a player depending on the setting to apply exhaustion.
The three options are:
- Apply During Combat
- Apply After Combat (Default)
- Always

## Exhaustion Modes
### Apply During Combat
Whenever a player gains HP from the unconscious state, during combat, 1 level of exhaustion is applied instantly. (Downs do not count outside of combat)

### Apply After Combat
Whenever a player gains HP from the unconscious state, during combat, 1 level of exhaustion is added to a tracker and all those levels in the tracker are applied at the end of combat. (Downs are not tracked outside of combat)

### Always
Whenever a player gains HP from the unconscious state, regardless of being in combat or not, they will receive 1 level of exhaustion.

## Exhaustion on Death Fail
If this option is selected, instead of a level of exhaustion being added when a character goes down, the exhaustion is instead added when the player fails their first death save.  
This option runs in conjunction with the exhaustion mode that is chosen. (eg. After Combat will count the number of first death fails in current combat then add them at the end)

## DC for Exhaustion
When this setting is enabled, whenever you would gain a level of exhaustion, a Constitution (CON) Save is initiated. This CON Save DC is set by the DM in the settings.  
On a failure, 1 level of exhaustion is applied.

### Single Check After Combat
When this setting is enabled, instead of asking for a CON Save per down during combat, the module stacks the tracker and adds it to the base DC for a single save at the end of combat.  
(Only adds one level of exhaustion at end of combat on a failed save)

---

## ⚠️ Experimental: Exhaustion Override
A new **Exhaustion Override** setting (`exhaustionOverrideSwap`) has been introduced.  
When enabled, the module forces exhaustion mechanics to the *opposite* of the active dnd5e core ruleset:

- On **2014 (legacy)** cores → applies **2024** exhaustion rules  
  (–2 to all d20 tests per level, –5 ft speed per level).  
- On **2024 (modern)** cores → emulates the **2014** exhaustion table  
  (disadvantage, halved speed, HP max halved, speed 0, death).

> **Default behavior remains unchanged.**  
> If the setting is left **off**, the module continues to function exactly as in previous versions.  
> This feature is marked **experimental** and may interact unexpectedly with other modules or future dnd5e system updates.

---

## License
Combat Exhaustion is released under the [MIT License](./LICENSE).

## Contact
For issues, please raise a bug in GitHub giving as much detail as you can. I will try to fix things as quickly as possible:  
[https://github.com/ReAcTiOnN77/combat-exhaustion/issues](https://github.com/ReAcTiOnN77/combat-exhaustion/issues)
