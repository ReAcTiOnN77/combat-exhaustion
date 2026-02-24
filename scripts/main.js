export const MODULE_ID = "combat-exhaustion";
export const DEBUG_MODE = false; // flip to true for verbose logs

import { isActorInCombat, updateExhaustion, promptConSave, logDebug } from "./helpers.js";
import { registerSettings } from "./config.js";
import { initExhaustionOverride, OVERRIDE_UPDATE_GUARD } from "./exhaustionOverride.js";

// Register settings and let the override file attach its own hooks
Hooks.once("init", () => {
  registerSettings();
  initExhaustionOverride();
});

// Re-entrancy guard: ignore the updates we ourselves cause.
// Also merged with OVERRIDE_UPDATE_GUARD so exhaustionOverride.js actor.update()
// calls are invisible to this hook (fixes issue #4).
const INTERNAL_UPDATE_GUARD = new Set();

function isGuarded(actorId) {
  return INTERNAL_UPDATE_GUARD.has(actorId) || OVERRIDE_UPDATE_GUARD.has(actorId);
}

/** Snapshot of HP *before* updates apply (per-actor) */
const LAST_HP = new Map();

/** Capture old HP before Foundry writes the new value */
Hooks.on("preUpdateActor", (actor, updateData, options, userId) => {
  const oldHp = foundry.utils.getProperty(actor, "system.attributes.hp.value");
  if (typeof oldHp === "number") LAST_HP.set(actor.id, oldHp);
});

Hooks.once("ready", async () => {
  console.log("Combat Exhaustion module loaded.");

  const MODULE_VERSION = game.modules.get(MODULE_ID)?.version;

  // One-time upgrade note (per version)
  try {
    const lastVersion = game.settings.get(MODULE_ID, "lastNotifiedVersion") ?? "";
    if (game.user.isGM && MODULE_VERSION && MODULE_VERSION !== lastVersion) {
      await ChatMessage.create({
        speaker: { alias: "Combat Exhaustion" },
        whisper: ChatMessage.getWhisperRecipients("GM"), // GM eyes only
        content: `
          <h2>Combat Exhaustion Updated</h2>
          <p>You have updated to <strong>v${MODULE_VERSION}</strong>.</p>
          <p>This release adds an <em>experimental Exhaustion Override</em> setting:</p>
          <ul>
            <li>On 5e rules version <strong>2014 (legacy)</strong> → applies <strong>2024 rules</strong>.</li>
            <li>On 5e rules version <strong>2024 (modern)</strong> → emulates the <strong>2014 table</strong>.</li>
          </ul>
          <p>By default the module behavior is unchanged. You can enable the override in
          <strong>Module Settings → Combat Exhaustion</strong>.</p>
        `
      });
      await game.settings.set(MODULE_ID, "lastNotifiedVersion", MODULE_VERSION);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | upgrade notice failed:`, err);
  }

  // ---- On-ready seeding: initialize previousHp for owned actors if missing ----
  try {
    const actors = (game.actors ?? []).filter(a => a?.isOwner || game.user.isGM);
    for (const a of actors) {
      if (a.getFlag(MODULE_ID, "previousHp") == null) {
        const cur = foundry.utils.getProperty(a, "system.attributes.hp.value");
        if (typeof cur === "number") {
          INTERNAL_UPDATE_GUARD.add(a.id);
          try {
            await a.setFlag(MODULE_ID, "previousHp", cur);
            logDebug?.(`Seeded previousHp for ${a.name} = ${cur}`);
          } finally {
            INTERNAL_UPDATE_GUARD.delete(a.id);
          }
        }
      }
      LAST_HP.delete(a.id);
    }
  } catch (err) {
    console.error(`Combat Exhaustion | Seeding previousHp failed:`, err);
  }
});

Hooks.on("updateActor", async (actor, updateData, options, userId) => {
  // Ignore our own internal updates AND exhaustionOverride.js updates
  if (isGuarded(actor.id)) return;

  // v13-safe ownership check
  if (!actor.isOwner && !game.user.isGM) return;

  // We only care if HP or death save failure changed; otherwise bail to avoid loops
  const hpChanged = foundry.utils.hasProperty(updateData, "system.attributes.hp.value");
  const deathFailChanged = foundry.utils.hasProperty(updateData, "system.attributes.death.failure");
  if (!hpChanged && !deathFailChanged) return;

  const exhaustionMode          = game.settings.get(MODULE_ID, "exhaustionMode");
  const exhaustOnFirstDeathFail = game.settings.get(MODULE_ID, "exhaustOnFirstDeathFail");
  const enableConSave           = game.settings.get(MODULE_ID, "enableConSave");
  const baseSaveDC              = Number(game.settings.get(MODULE_ID, "baseSaveDC"));
  const afterCombatCheckMode    = game.settings.get(MODULE_ID, "afterCombatCheckMode");
  const inCombat                = isActorInCombat(actor);

  // New (post-update) value
  const hpValue =
    foundry.utils.getProperty(updateData, "system.attributes.hp.value") ??
    foundry.utils.getProperty(actor, "system.attributes.hp.value");

  // Previous value priority: persistent flag → preUpdate snapshot → (new) doc value
  const prevHpValue =
    actor.getFlag(MODULE_ID, "previousHp") ??
    LAST_HP.get(actor.id) ??
    foundry.utils.getProperty(actor, "system.attributes.hp.value");

  logDebug(
    `updateActor for ${actor.name}: hp=${hpValue} prev=${prevHpValue} ` +
    `mode=${exhaustionMode} inCombat=${inCombat} hpChanged=${!!hpChanged} deathFailChanged=${!!deathFailChanged}`
  );

  let increaseTracker = false;

  // ----- HP RISE FROM 0 → >0 (the "back up" moment) -----
  // Gate writes on isGM to prevent duplicate exhaustion when multiple clients
  // own the same actor and both receive the updateActor hook simultaneously.
  if (hpChanged && hpValue > 0 && prevHpValue === 0 && game.user.isGM) {
    try {
      INTERNAL_UPDATE_GUARD.add(actor.id);

      // Reset first-death-fail flag when actor is healed from 0 HP
      await actor.unsetFlag(MODULE_ID, "firstDeathFail");

      if (!exhaustOnFirstDeathFail) {
        increaseTracker = true;
        if (
          enableConSave &&
          afterCombatCheckMode === "disabled" &&
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
  if (deathFailChanged && exhaustOnFirstDeathFail && game.user.isGM) {
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
  if (hpChanged && hpValue !== prevHpValue && game.user.isGM) {
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
  const exhaustionMode       = game.settings.get(MODULE_ID, "exhaustionMode");
  const baseSaveDC           = Number(game.settings.get(MODULE_ID, "baseSaveDC"));
  const afterCombatCheckMode = game.settings.get(MODULE_ID, "afterCombatCheckMode");

  // Only GM runs end-of-combat exhaustion to prevent duplicate writes
  if (!game.user.isGM) return;

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;

    if (exhaustionMode !== "afterCombat") continue;

    const exhaustionTracker = actor.getFlag(MODULE_ID, "exhaustionTracker") || 0;

    // Always reset the tracker regardless of outcome
    try {
      INTERNAL_UPDATE_GUARD.add(actor.id);
      await actor.setFlag(MODULE_ID, "exhaustionTracker", 0);
    } finally {
      INTERNAL_UPDATE_GUARD.delete(actor.id);
    }

    if (exhaustionTracker <= 0) continue;

    const dc = baseSaveDC + exhaustionTracker;
    logDebug(`End of combat for ${actor.name}: tracker=${exhaustionTracker} dc=${dc} mode=${afterCombatCheckMode}`);

    // "disabled": no save, apply all stacked levels directly
    if (afterCombatCheckMode === "disabled") {
      logDebug(`Applying ${exhaustionTracker} exhaustion to ${actor.name} (no check).`);
      try {
        INTERNAL_UPDATE_GUARD.add(actor.id);
        await updateExhaustion(actor, exhaustionTracker);
      } finally {
        INTERNAL_UPDATE_GUARD.delete(actor.id);
      }

    // "singleExhaustion": Con save at DC (base + downs); fail = 1 level
    } else if (afterCombatCheckMode === "singleExhaustion") {
      const success = await promptConSave(actor, dc);  // guard NOT held during dialog
      if (!success) {
        logDebug(`Single exhaustion check failed for ${actor.name}, applying 1 level.`);
        try {
          INTERNAL_UPDATE_GUARD.add(actor.id);
          await updateExhaustion(actor, 1);
        } finally {
          INTERNAL_UPDATE_GUARD.delete(actor.id);
        }
      }

    // "stackedExhaustion": Con save at DC (base + downs); fail = all N levels
    } else if (afterCombatCheckMode === "stackedExhaustion") {
      const success = await promptConSave(actor, dc);  // guard NOT held during dialog
      if (!success) {
        logDebug(`Stacked exhaustion check failed for ${actor.name}, applying ${exhaustionTracker} levels.`);
        try {
          INTERNAL_UPDATE_GUARD.add(actor.id);
          await updateExhaustion(actor, exhaustionTracker);
        } finally {
          INTERNAL_UPDATE_GUARD.delete(actor.id);
        }
      }
    }
  }
});
