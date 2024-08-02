export const MODULE_ID = "combat-exhaustion";
export const DEBUG_MODE = false; // Set to true for debugging, false to disable

import { isActorInCombat, updateExhaustion, logDebug } from "./helpers.js";
import { registerSettings } from "./config.js";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.on("ready", () => {
  console.log("Combat Exhaustion module loaded.");
});

// Track when a player actor's HP changes
Hooks.on("updateActor", async (actor, updateData) => {
  if (!actor.hasPlayerOwner && !game.user.isGM) return;

  const hpValue = getProperty(updateData, "system.attributes.hp.value");
  const prevHpValue = actor.getFlag(MODULE_ID, "previousHp") ?? getProperty(actor, "system.attributes.hp.value");
  const exhaustionMode = game.settings.get(MODULE_ID, "exhaustionMode");
  const inCombat = isActorInCombat(actor);

  logDebug(`Actor updated: ${actor.name}, HP: ${hpValue}, Previous HP: ${prevHpValue}, Mode: ${exhaustionMode}, In Combat: ${inCombat}`);

  // Track hitting 0 HP and restore from 0 HP
  if (hpValue > 0 && prevHpValue === 0) {
    if (exhaustionMode === "afterCombat" && inCombat) {
      const currentTracker = actor.getFlag(MODULE_ID, "exhaustionTracker") || 0;
      const newTrackerValue = currentTracker + 1;
      logDebug(`Updating exhaustionTracker for ${actor.name} from ${currentTracker} to ${newTrackerValue}`);
      await actor.setFlag(MODULE_ID, "exhaustionTracker", newTrackerValue);
    } else if ((exhaustionMode === "duringCombat" && inCombat) || exhaustionMode === "always") {
      await updateExhaustion(actor, 1);
    }
  }

  // Update the previous HP value flag
  await actor.setFlag(MODULE_ID, "previousHp", hpValue);
});

// Add exhaustion at the end of combat
Hooks.on("deleteCombat", async (combat, options, userId) => {
  const exhaustionMode = game.settings.get(MODULE_ID, "exhaustionMode");

  for (let combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor || (!actor.hasPlayerOwner && !game.user.isGM)) continue;

    if (exhaustionMode === "afterCombat" || exhaustionMode === "always") {
      const exhaustionTracker = actor.getFlag(MODULE_ID, "exhaustionTracker");
      if (exhaustionTracker) {
        logDebug(`Adding ${exhaustionTracker} exhaustion point(s) to ${actor.name} after combat.`);
        await updateExhaustion(actor, exhaustionTracker);
      }
    }
    await actor.setFlag(MODULE_ID, "exhaustionTracker", 0); // Reset the exhaustion tracker to 0
    await actor.setFlag(MODULE_ID, "previousHp", 0); // Reset the previous HP flag to 0
  }
});
