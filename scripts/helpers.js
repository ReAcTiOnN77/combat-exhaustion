import { DEBUG_MODE } from "./main.js";

// Helper function to check if actor is in combat
export function isActorInCombat(actor) {
  return game.combats.some(combat => combat.combatants.some(combatant => combatant.actorId === actor.id && combat.started));
}

// Helper function to update actor's exhaustion
export async function updateExhaustion(actor, amount) {
  let exhaustion = foundry.utils.getProperty(actor, "system.attributes.exhaustion");
  logDebug(`Current exhaustion value: ${exhaustion} (type: ${typeof exhaustion})`);

  exhaustion = parseInt(exhaustion ?? 0, 10);
  logDebug(`Parsed exhaustion value: ${exhaustion} (type: ${typeof exhaustion})`);

  exhaustion = Math.clamp(exhaustion + amount, 0, CONFIG.DND5E.conditionTypes.exhaustion.levels);
  logDebug(`Updating exhaustion for ${actor.name} to ${exhaustion} (type: ${typeof exhaustion})`);

  // Ensure exhaustion is an integer before updating
  if (Number.isInteger(exhaustion)) {
    try {
      await actor.update({ "system.attributes.exhaustion": exhaustion });
    } catch (error) {
      logDebug(`Error updating exhaustion for ${actor.name}: ${error.message}`);
      console.error(error);
    }
  } else {
    logDebug(`Failed to update exhaustion for ${actor.name}: value is not an integer`);
  }
}

export async function promptConSave(actor, dc) {
  const result = await actor.rollAbilitySave('con', { chatMessage: false });
  const success = result.total >= dc;

  // Render the roll and include it in the custom message
  const rollHTML = await result.render();
  const messageContent = `
    <i>Constitution Save</i> (DC ${dc}).
    <br><b>${success ? "Passed the Roll" : "Failed Roll.<br>Gains a level of Exhaustion"}</b>
  `;

  // Create the custom chat message
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
	content: `${messageContent} ${rollHTML}`,
    type: CONST.CHAT_MESSAGE_TYPES.ROLL,

  });

  return success;
}

// Helper function for debug logging
export function logDebug(message) {
  if (DEBUG_MODE) {
    console.log(`Combat Exhaustion | ${message}`);
  }
}
