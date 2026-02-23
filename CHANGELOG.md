## Version 1.4.1
- Fixed minor bugs in the exhaustion override
- Fixed bug with override not playing nice with MidiQoL competing with prepareData
- Fixed bug were updateActor fired on every connected client
  
## Version 1.4.0
- Added a new **experimental Exhaustion Override setting** (`exhaustionOverrideSwap`).
  - When enabled, the module forces exhaustion mechanics to the *opposite* of the active dnd5e core ruleset:
    - On **2014 (legacy)** cores → applies **2024** exhaustion rules (–2 to all d20 tests per level, –5 ft speed per level).
    - On **2024 (modern)** cores → emulates the **2014** exhaustion table (disadvantage, halved speed, etc).
- **Default behavior remains unchanged.**  
  - If the setting is left **off**, the module continues to function exactly as in v1.3.1.
- Marked as **experimental**: this feature is still under active testing and may interact unexpectedly with other modules or future dnd5e system updates.

## Version 1.3.1
- Fixed missed exhaustion trigger when reviving from 0 HP on the first update event  
  (added on-ready seeding and preUpdateActor snapshot for accurate previous HP tracking)

## Version 1.3.0
- Fixed Actor Loop Error
- Updated for Foundry VTT v13.348
- Updated for D&D 5e v5.1.4

## Version 1.2.1
- Fixed an error that caused exhaustion not to be added due to addExhaustion not being declared within certain setting combos
  
## Version 1.2.0
- Added an option to enable a CON Save for exhaustion on a pass no exhaustion is added. On a fail 1 level is added.
- Added option instead of exhaustion being added at end of combat for the amount of failed CON Saves, option allows for the tracking of downs then adds this to the base DC for CON Save. (Only adds one level of exhaustion, if enabled)

## Version 1.1.0
- Added new option that adds exhaustion on first failed death save instead of downed state. Adds depending on Exhaustion Mode.

## Version 1.0.1
- Added "Languages" folder to package (previously missing caused error on install)

## Version 1.0.0
- Initial Release
