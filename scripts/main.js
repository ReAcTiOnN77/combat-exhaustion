export const MODULE_ID = "combat-exhaustion";
export const DEBUG_MODE = false; // flip to true for verbose logs

import { isActorInCombat, updateExhaustion, promptConSave, logDebug } from "./helpers.js";
import { registerSettings } from "./config.js";

Hooks.once("init", registerSettings);

// Re-entrancy guard: ignore the updates we ourselves cause
const INTERNAL_UPDATE_GUARD = new Set();

Hooks.on("ready", () => {
  console.log("Combat Exhaustion module loaded.");
});

Hooks.on("updateActor", async (actor, updateData, options, userId) => {
  // Ignore our own internal updates
  if (INTERNAL_UPDATE_GUARD.has(actor.id)) return;

  // v13-safe ownership check
  if (!actor.isOwner && !game.user.isGM) return;

  // We only care if HP or death save failure changed; otherwise bail to avoid loops
  const hpChanged = foundry.utils.hasProperty(updateData, "system.attributes.hp.value");
  const deathFailChanged = foundry.utils.hasProperty(updateData, "system.attributes.death.failure");
  if (!hpChanged && !deathFailChanged) return;

  const exhaustionMode = game.settings.get(MODULE_ID, "exhaustionMode");
  const exhaustOnFirstDeathFail = game.settings.get(MODULE_ID, "exhaustOnFirstDeathFail");
  const enableConSave = game.settings.get(MODULE_ID, "enableConSave");
  const baseSaveDC = Number(game.settings.get(MODULE_ID, "baseSaveDC"));
  const singleCheckAfterCombat = game.settings.get(MODULE_ID, "singleCheckAfterCombat");
  const inCombat = isActorInCombat(actor);

  // Read current values (prefer the update payload, fall back to doc)
  const hpValue = foundry.utils.getProperty(updateData, "system.attributes.hp.value") ??
                  foundry.utils.getProperty(actor, "system.attributes.hp.value");
  const prevHpValue = actor.getFlag(MODULE_ID, "previousHp") ??
                      foundry.utils.getProperty(actor, "system.attributes.hp.value");

  logDebug(
    `updateActor for ${actor.name}: hp=${hpValue} prev=${prevHpValue} ` +
    `mode=${exhaustionMode} inCombat=${inCombat} hpChanged=${hpChanged} deathFailChanged=${deathFailChanged}`
  );

  let increaseTracker = false;

  // ----- HP RISE FROM 0 → >0 (the “back up” moment) -----
  if (hpChanged && hpValue > 0 && prevHpValue === 0) {
    try {
      INTERNAL_UPDATE_GUARD.add(actor.id);

      // Reset first-death-fail flag when actor is healed from 0 HP
      await actor.unsetFlag(MODULE_ID, "firstDeathFail");

      if (!exhaustOnFirstDeathFail) {
        increaseTracker = true;
        if (
          enableConSave &&
          !singleCheckAfterCombat &&
          ((exhaustionMode === "duringCombat" && inCombat) ||
            exhaustionMode === "always" ||
            (exhaustionMode === "afterCombat" && inCombat))
        ) {
          const success = await promptConSave(actor, baseSaveDC);
          increaseTracker = !success;
        }

        if (increaseTracker) {
          if (exhaustionMode === "afterCombat" && inCombat) {
            const currentTracker = actor.getFlag(MODULE_ID, "exhaustionTracker") || 0;
            const newTrackerValue = currentTracker + 1;
            logDebug(`Queue exhaustion (after combat): ${currentTracker} -> ${newTrackerValue}`);
            await actor.setFlag(MODULE_ID, "exhaustionTracker", newTrackerValue);
          } else if ((exhaustionMode === "duringCombat" && inCombat) || exhaustionMode === "always") {
            await updateExhaustion(actor, 1);
          }
        }
      }
    } finally {
      INTERNAL_UPDATE_GUARD.delete(actor.id);
    }
  }

  // ----- FIRST DEATH SAVE FAILURE PATH -----
  if (deathFailChanged && exhaustOnFirstDeathFail) {
    const deathFails =
      foundry.utils.getProperty(updateData, "system.attributes.death.failure") ??
      foundry.utils.getProperty(actor, "system.attributes.death.failure");

    if (Number(deathFails) > 0 && !actor.getFlag(MODULE_ID, "firstDeathFail")) {
      try {
        INTERNAL_UPDATE_GUARD.add(actor.id);

        logDebug(`${actor.name} recorded first death save failure.`);
        await actor.setFlag(MODULE_ID, "firstDeathFail", true);

        increaseTracker = true;
        if (exhaustionMode === "afterCombat" && inCombat) {
          if (enableConSave) {
            const success = await promptConSave(actor, baseSaveDC);
            increaseTracker = !success;
          }
          if (increaseTracker) {
            const currentTracker = actor.getFlag(MODULE_ID, "exhaustionTracker") || 0;
            const newTrackerValue = currentTracker + 1;
            logDebug(`Queue exhaustion due to death-fail: ${currentTracker} -> ${newTrackerValue}`);
            await actor.setFlag(MODULE_ID, "exhaustionTracker", newTrackerValue);
          }
        } else if ((exhaustionMode === "duringCombat" && inCombat) || exhaustionMode === "always") {
          if (enableConSave && inCombat) {
            const success = await promptConSave(actor, baseSaveDC);
            increaseTracker = !success;
          }
          if (increaseTracker) await updateExhaustion(actor, 1);
        }
      } finally {
        INTERNAL_UPDATE_GUARD.delete(actor.id);
      }
    }
  }

  // ----- Persist previousHp only if changed -----
  if (hpChanged && hpValue !== prevHpValue) {
    try {
      INTERNAL_UPDATE_GUARD.add(actor.id);
      await actor.setFlag(MODULE_ID, "previousHp", hpValue);
    } finally {
      INTERNAL_UPDATE_GUARD.delete(actor.id);
    }
  }
});

// Add exhaustion at the end of combat
Hooks.on("deleteCombat", async (combat) => {
  const exhaustionMode = game.settings.get(MODULE_ID, "exhaustionMode");
  const enableConSave = game.settings.get(MODULE_ID, "enableConSave");
  const baseSaveDC = Number(game.settings.get(MODULE_ID, "baseSaveDC"));
  const singleCheckAfterCombat = game.settings.get(MODULE_ID, "singleCheckAfterCombat");

  for (let combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor || (!actor.isOwner && !game.user.isGM)) continue;

    try {
      INTERNAL_UPDATE_GUARD.add(actor.id);

      if (exhaustionMode === "afterCombat") {
        const exhaustionTracker = actor.getFlag(MODULE_ID, "exhaustionTracker") || 0;
        if (exhaustionTracker > 0) {
          let addExhaustion = true;
          if (enableConSave && singleCheckAfterCombat) {
            const dc = baseSaveDC + exhaustionTracker;
            const success = await promptConSave(actor, dc);
            addExhaustion = !success;
          }
          if (addExhaustion) {
            logDebug(`Applying ${exhaustionTracker} exhaustion to ${actor.name} after combat.`);
            await updateExhaustion(actor, exhaustionTracker);
          }
        }
      }

      // Reset trackers (no-op if already zero)
      await actor.setFlag(MODULE_ID, "exhaustionTracker", 0);
      // Do not force previousHp to 0 here; let it reflect last known HP transition
    } finally {
      INTERNAL_UPDATE_GUARD.delete(actor.id);
    }
  }
});
