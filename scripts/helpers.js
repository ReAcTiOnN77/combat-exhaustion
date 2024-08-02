import { DEBUG_MODE } from "./main.js";

// Helper function to check if actor is in combat
export function isActorInCombat(actor) {
	return game.combats.some(combat => combat.combatants.some(combatant => combatant.actorId === actor.id && combat.started));
}

// Helper function to update actor's exhaustion
export async function updateExhaustion(actor, amount) {
  let exhaustion = getProperty(actor, "system.attributes.exhaustion");
  logDebug(`Current exhaustion value: ${exhaustion} (type: ${typeof exhaustion})`);

  if (exhaustion === undefined || exhaustion === null) {
    exhaustion = 0;
  } else {
    exhaustion = parseInt(exhaustion, 10);
  }

  logDebug(`Parsed exhaustion value: ${exhaustion} (type: ${typeof exhaustion})`);

  exhaustion += amount;
  exhaustion = Math.clamp(exhaustion, 0, CONFIG.DND5E.conditionTypes.exhaustion.levels);

  logDebug(`Updating exhaustion for ${actor.name} to ${exhaustion} (type: ${typeof exhaustion})`);

  // Ensure exhaustion is an integer before updating
  if (Number.isInteger(exhaustion)) {
    await actor.update({ "system.attributes.exhaustion": exhaustion }).catch(error => {
      logDebug(`Error updating exhaustion for ${actor.name}: ${error.message}`);
      console.error(error);
    });
  } else {
    logDebug(`Failed to update exhaustion for ${actor.name}: value is not an integer`);
  }
}

// Helper function for debug logging
export function logDebug(message) {
	if (DEBUG_MODE) {
		console.log(`Combat Exhaustion | ${message}`);
	}	
}