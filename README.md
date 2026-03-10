[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/7DkfrUV7ru)
[![Patreon](https://img.shields.io/badge/Patreon-Support-F96854?logo=patreon&logoColor=white)](https://www.patreon.com/cw/ReAcTiOnN)

# Combat Exhaustion
A D&D 5e Foundry VTT module that automatically applies exhaustion when a character is downed in combat.

---

## How It Works
Each time a character is brought back up from 0 HP, the module triggers an exhaustion event. Depending on your settings, this may apply immediately or be held until the end of combat. A save can optionally be required before any exhaustion is applied.

---

## Settings

### When Is Exhaustion Applied?
Controls the moment exhaustion is applied:
- **After Combat (Queued)** *(default)* — Each time a character goes down, 1 level is added to a tracker. All tracked levels are applied when combat ends.
- **During Combat Only (Immediately)** — Exhaustion is applied the moment a character gets back up. Only triggers during active combat.
- **Always (Immediately)** — Exhaustion is applied immediately whenever a character goes down, even outside of combat.

---

### Trigger on First Death Save Failure
When enabled, the exhaustion trigger shifts from the moment a character **gets back up** to the moment they **fail their first death saving throw**.

Works alongside whichever exhaustion mode is selected — for example, in After Combat mode it tracks the number of first death save failures and applies them all at the end of combat.

---

### Require a Save to Avoid Exhaustion
When enabled, a save is prompted before exhaustion is applied. Pass the save and exhaustion is avoided entirely. The DC is set by **Base Save DC**.

- **Disabled** *(default)* — No save required, exhaustion is applied automatically.
- **CON Save** — Uses the character's Constitution modifier.
- **Flat d20** — An unmodified die roll with no ability modifiers.

---

### Base Save DC
The base difficulty for the save roll. When using **After Combat: Exhaustion Mode** with a save, this DC increases by 1 for each time the character went down during the fight.

> **Example:** Base DC 10, character went down 3 times → DC 13.

Setting this to **0** disables all combat exhaustion triggers entirely, while keeping Long Rest Quality and Ruleset Swap active.

---

### After Combat: Exhaustion Mode
Only applies when **When Is Exhaustion Applied?** is set to *After Combat (Queued)*. Controls how much exhaustion is applied at the end of combat, and whether a save is required:

- **No Save — All Exhaustions** — No roll required. Applies 1 level of exhaustion per down automatically.
- **Save — Single Exhaustion** — One save at the scaled DC. Fail = 1 level of exhaustion, regardless of how many times the character went down.
- **Save — Stacked Exhaustion** — One save at the scaled DC. Fail = 1 level of exhaustion per down.

---

### Enable Long Rest Quality
When enabled, the GM is prompted to choose a rest quality tier at the start of each long rest, determining how much exhaustion is recovered. Requires a reload.

- **Standard Rest** — Rough sleeping, camping, or a basic tavern. Recover 1 exhaustion.
- **Comfortable Rest** — A private room at a good inn or similarly comfortable lodging. Recover 2 exhaustion.
- **Luxury Rest** — A luxury suite at a fine inn, bathhouse, or accommodations with exceptional comfort and care. Recover 3 exhaustion.

If a player initiates the rest, they will wait while the GM selects the quality. The GM can cancel the rest from the dialog, which cancels it for all players.

Compatible with the **Rest Recovery** module — the quality dialog intercepts the batch rest flow and applies per-actor before Rest Recovery processes the rest.

---

### Swap Exhaustion Ruleset
When enabled, the module forces exhaustion mechanics to the **opposite** of your active dnd5e ruleset:

| Active Ruleset | With Override Enabled |
|---|---|
| 2014 (legacy) | Applies **2024** rules: –2 to all d20 tests per level, –5 ft speed per level |
| 2024 (modern) | Applies **2014** rules: disadvantage on checks, halved speed, halved HP max, speed 0, then death |

Default behaviour is unchanged when this setting is off. Requires a reload.

---

## License
Released under the [MIT License](./LICENSE).

## Issues & Support
Found a bug? Please open an issue on GitHub with as much detail as possible:
[https://github.com/ReAcTiOnN77/combat-exhaustion/issues](https://github.com/ReAcTiOnN77/combat-exhaustion/issues)
