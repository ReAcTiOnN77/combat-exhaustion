export const MODULE_ID = "combat-exhaustion";

import { isActorInCombat, updateExhaustion, promptConSave, promptFlatD20, initSaveListener } from "./helpers.js";
import { registerSettings } from "./config.js";
import { initExhaustionOverride, OVERRIDE_UPDATE_GUARD } from "./exhaustionOverride.js";
import { initLongRestQuality } from "./longRestQuality.js";

/* -------------------------------------------------- */
/*  Init                                              */
/* -------------------------------------------------- */

Hooks.once("init", () => {
  registerSettings();
  initExhaustionOverride();
  if (game.settings.get(MODULE_ID, "enableLongRestQuality")) initLongRestQuality();
});

/* -------------------------------------------------- */
/*  Guards & HP snapshot                              */
/* -------------------------------------------------- */

const INTERNAL_UPDATE_GUARD = new Set();

function isGuarded(actorId) {
  return INTERNAL_UPDATE_GUARD.has(actorId) || OVERRIDE_UPDATE_GUARD.has(actorId);
}

const LAST_HP = new Map();

Hooks.on("preUpdateActor", (actor, updateData) => {
  const oldHp = foundry.utils.getProperty(actor, "system.attributes.hp.value");
  if (typeof oldHp === "number") LAST_HP.set(actor.id, oldHp);
});

/* -------------------------------------------------- */
/*  Save prompt helper                                */
/* -------------------------------------------------- */

async function promptSave(actor, dc) {
  const saveMode = game.settings.get(MODULE_ID, "saveMode");
  if (saveMode === "conSave")  return promptConSave(actor, dc);
  if (saveMode === "flatD20")  return promptFlatD20(actor, dc);
  return true; // "disabled" — auto-pass, no roll
}

function saveEnabled() {
  return game.settings.get(MODULE_ID, "saveMode") !== "disabled";
}

/* -------------------------------------------------- */
/*  Ready: upgrade notice & seed previousHp           */
/* -------------------------------------------------- */

Hooks.once("ready", async () => {
  initSaveListener();
  const MODULE_VERSION = game.modules.get(MODULE_ID)?.version;

  try {
    const lastVersion = game.settings.get(MODULE_ID, "lastNotifiedVersion") ?? "";
    if (game.user.isGM && MODULE_VERSION && MODULE_VERSION !== lastVersion) {
      await ChatMessage.create({
        speaker: { alias: "Combat Exhaustion" },
        whisper: ChatMessage.getWhisperRecipients("GM"),
        content: `
          <h2>Combat Exhaustion Updated to v${MODULE_VERSION}</h2>
          <p>⚠️ <strong>Breaking Change:</strong> The <strong>Require a CON Save to Avoid Exhaustion</strong>
          checkbox has been replaced by <strong>Require a Save to Avoid Exhaustion</strong>, a dropdown with
          three options: Disabled, CON Save, and Flat d20. Your previous setting has been reset — please
          update it under <strong>Module Settings → Combat Exhaustion</strong>.</p>
        `
      });
      await game.settings.set(MODULE_ID, "lastNotifiedVersion", MODULE_VERSION);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | upgrade notice failed:`, err);
  }

  try {
    const actors = (game.actors ?? []).filter(a => a?.isOwner || game.user.isGM);
    for (const a of actors) {
      if (a.getFlag(MODULE_ID, "previousHp") == null) {
        const cur = foundry.utils.getProperty(a, "system.attributes.hp.value");
        if (typeof cur === "number") {
          INTERNAL_UPDATE_GUARD.add(a.id);
          try {
            await a.setFlag(MODULE_ID, "previousHp", cur);
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

/* -------------------------------------------------- */
/*  updateActor: exhaustion on down / death save      */
/* -------------------------------------------------- */

Hooks.on("updateActor", async (actor, updateData) => {
  if (isGuarded(actor.id)) return;
  if (!actor.isOwner && !game.user.isGM) return;

  const hpChanged        = foundry.utils.hasProperty(updateData, "system.attributes.hp.value");
  const deathFailChanged = foundry.utils.hasProperty(updateData, "system.attributes.death.failure");
  if (!hpChanged && !deathFailChanged) return;

  const exhaustionMode          = game.settings.get(MODULE_ID, "exhaustionMode");
  const exhaustOnFirstDeathFail = game.settings.get(MODULE_ID, "exhaustOnFirstDeathFail");
  const baseSaveDC              = Number(game.settings.get(MODULE_ID, "baseSaveDC"));
  const afterCombatCheckMode    = game.settings.get(MODULE_ID, "afterCombatCheckMode");
  const inCombat                = isActorInCombat(actor);

  // DC of 0 disables combat exhaustion triggers entirely
  if (baseSaveDC === 0) return;

  const hpValue =
    foundry.utils.getProperty(updateData, "system.attributes.hp.value") ??
    foundry.utils.getProperty(actor, "system.attributes.hp.value");

  const prevHpValue =
    actor.getFlag(MODULE_ID, "previousHp") ??
    LAST_HP.get(actor.id) ??
    foundry.utils.getProperty(actor, "system.attributes.hp.value");

  // HP rose from 0 — actor got back up
  if (hpChanged && hpValue > 0 && prevHpValue === 0 && game.user.isGM) {
    try {
      INTERNAL_UPDATE_GUARD.add(actor.id);
      await actor.unsetFlag(MODULE_ID, "firstDeathFail");

      if (!exhaustOnFirstDeathFail) {
        let applyExhaustion = true;
        if (
          saveEnabled() &&
          afterCombatCheckMode === "disabled" &&
          ((exhaustionMode === "duringCombat" && inCombat) ||
            exhaustionMode === "always" ||
            (exhaustionMode === "afterCombat" && inCombat))
        ) {
          applyExhaustion = !(await promptSave(actor, baseSaveDC));
        }

        if (applyExhaustion) {
          if (exhaustionMode === "afterCombat" && inCombat) {
            const tracker = actor.getFlag(MODULE_ID, "exhaustionTracker") || 0;
            await actor.setFlag(MODULE_ID, "exhaustionTracker", tracker + 1);
          } else if ((exhaustionMode === "duringCombat" && inCombat) || exhaustionMode === "always") {
            await updateExhaustion(actor, 1);
          }
        }
      }
    } finally {
      INTERNAL_UPDATE_GUARD.delete(actor.id);
    }
  }

  // First death save failure
  if (deathFailChanged && exhaustOnFirstDeathFail && game.user.isGM) {
    const deathFails =
      foundry.utils.getProperty(updateData, "system.attributes.death.failure") ??
      foundry.utils.getProperty(actor, "system.attributes.death.failure");

    if (Number(deathFails) > 0 && !actor.getFlag(MODULE_ID, "firstDeathFail")) {
      try {
        INTERNAL_UPDATE_GUARD.add(actor.id);
        await actor.setFlag(MODULE_ID, "firstDeathFail", true);

        let applyExhaustion = true;
        if (exhaustionMode === "afterCombat" && inCombat) {
          if (saveEnabled()) applyExhaustion = !(await promptSave(actor, baseSaveDC));
          if (applyExhaustion) {
            const tracker = actor.getFlag(MODULE_ID, "exhaustionTracker") || 0;
            await actor.setFlag(MODULE_ID, "exhaustionTracker", tracker + 1);
          }
        } else if ((exhaustionMode === "duringCombat" && inCombat) || exhaustionMode === "always") {
          if (saveEnabled() && inCombat) applyExhaustion = !(await promptSave(actor, baseSaveDC));
          if (applyExhaustion) await updateExhaustion(actor, 1);
        }
      } finally {
        INTERNAL_UPDATE_GUARD.delete(actor.id);
      }
    }
  }

  // Persist previousHp
  if (hpChanged && hpValue !== prevHpValue && game.user.isGM) {
    try {
      INTERNAL_UPDATE_GUARD.add(actor.id);
      await actor.setFlag(MODULE_ID, "previousHp", hpValue);
    } finally {
      INTERNAL_UPDATE_GUARD.delete(actor.id);
    }
  }
});

/* -------------------------------------------------- */
/*  deleteCombat: end-of-combat exhaustion check      */
/* -------------------------------------------------- */

Hooks.on("deleteCombat", async (combat) => {
  if (!game.user.isGM) return;

  const exhaustionMode       = game.settings.get(MODULE_ID, "exhaustionMode");
  const baseSaveDC           = Number(game.settings.get(MODULE_ID, "baseSaveDC"));
  const afterCombatCheckMode = game.settings.get(MODULE_ID, "afterCombatCheckMode");

  if (exhaustionMode !== "afterCombat") return;
  if (baseSaveDC === 0) return;

  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;

    const tracker = actor.getFlag(MODULE_ID, "exhaustionTracker") || 0;

    try {
      INTERNAL_UPDATE_GUARD.add(actor.id);
      await actor.setFlag(MODULE_ID, "exhaustionTracker", 0);
    } finally {
      INTERNAL_UPDATE_GUARD.delete(actor.id);
    }

    if (tracker <= 0) continue;

    const dc = baseSaveDC + tracker;

    if (afterCombatCheckMode === "disabled") {
      try {
        INTERNAL_UPDATE_GUARD.add(actor.id);
        await updateExhaustion(actor, tracker);
      } finally {
        INTERNAL_UPDATE_GUARD.delete(actor.id);
      }
    } else if (afterCombatCheckMode === "singleExhaustion") {
      if (!(await promptSave(actor, dc))) {
        try {
          INTERNAL_UPDATE_GUARD.add(actor.id);
          await updateExhaustion(actor, 1);
        } finally {
          INTERNAL_UPDATE_GUARD.delete(actor.id);
        }
      }
    } else if (afterCombatCheckMode === "stackedExhaustion") {
      if (!(await promptSave(actor, dc))) {
        try {
          INTERNAL_UPDATE_GUARD.add(actor.id);
          await updateExhaustion(actor, tracker);
        } finally {
          INTERNAL_UPDATE_GUARD.delete(actor.id);
        }
      }
    }
  }
});