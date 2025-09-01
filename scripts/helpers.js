import { DEBUG_MODE } from "./main.js";

// Is the actor actively in a started combat?
export function isActorInCombat(actor) {
  return game.combats.some((combat) => {
    const started = combat?.started ?? (combat.round > 0);
    return started && combat.combatants.some((c) => c.actorId === actor.id);
  });
}

// Update actor's exhaustion safely for dnd5e 5.x (default 0–6)
export async function updateExhaustion(actor, amount) {
  let exhaustion = foundry.utils.getProperty(actor, "system.attributes.exhaustion");
  logDebug(`Current exhaustion value: ${exhaustion} (type: ${typeof exhaustion})`);

  exhaustion = parseInt(exhaustion ?? 0, 10);
  logDebug(`Parsed exhaustion value: ${exhaustion} (type: ${typeof exhaustion})`);

  // Try to read a system-provided max; fallback to 6 (2014 rules)
  const configuredMax =
    foundry.utils.getProperty(CONFIG, "DND5E.exhaustion.max") ?? 6;

  const next = Math.clamp(exhaustion + amount, 0, configuredMax);
  logDebug(`Updating exhaustion for ${actor.name} to ${next} (max ${configuredMax})`);

  if (Number.isInteger(next)) {
    try {
      await actor.update({ "system.attributes.exhaustion": next });
    } catch (error) {
      logDebug(`Error updating exhaustion for ${actor.name}: ${error.message}`);
      console.error(error);
    }
  } else {
    logDebug(`Failed to update exhaustion for ${actor.name}: value is not an integer`);
  }
}

// Prompt a Constitution save and post a modern v13 chat message
export async function promptConSave(actor, dc) {
  // Use roll data directly to avoid dnd5e's internal mergeObject path
  const data = actor.getRollData ? actor.getRollData() : actor.system ?? {};
  // In 5.x, the save bonus lives at abilities.con.save.value
  const bonus =
    foundry.utils.getProperty(data, "abilities.con.save.value") ??
    foundry.utils.getProperty(actor, "system.abilities.con.save.value") ??
    0;

  const roll = await (new Roll(`1d20 + ${bonus}`)).evaluate({ async: true });
  const success = (roll.total ?? 0) >= Number(dc ?? 10);
  const rollHTML = await roll.render();

  const messageContent = `
    <i>Constitution Save</i> (DC ${dc}).<br>
    <b>${success ? "Passed the Roll" : "Failed Roll.<br>Gains a level of Exhaustion"}</b>
    ${rollHTML}
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: messageContent
  });

  return success;
}



// Debug logger
export function logDebug(message) {
  if (DEBUG_MODE) console.log(`Combat Exhaustion | ${message}`);
}
