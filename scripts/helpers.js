import { DEBUG_MODE } from "./main.js";

// Is the actor actively in a started combat?
export function isActorInCombat(actor) {
  return game.combats.some(
    (combat) => combat.started && combat.combatants.some((c) => c.actorId === actor.id)
  );
}

// Update actor's exhaustion safely for dnd5e 5.x
export async function updateExhaustion(actor, amount) {
  let exhaustion = foundry.utils.getProperty(actor, "system.attributes.exhaustion");
  logDebug(`Current exhaustion value: ${exhaustion} (type: ${typeof exhaustion})`);

  exhaustion = parseInt(exhaustion ?? 0, 10);
  logDebug(`Parsed exhaustion value: ${exhaustion} (type: ${typeof exhaustion})`);

  // dnd5e 5.x stores the max in conditionTypes.exhaustion.levels
  const configuredMax = CONFIG.DND5E.conditionTypes?.exhaustion?.levels ?? 6;

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

// Prompt a Constitution saving throw using dnd5e's native pipeline.
// Passing options.target = dc causes dnd5e to render the green/red pass/fail
// styling on the chat card automatically. DSN fires normally. No custom card needed.
export async function promptConSave(actor, dc) {
  const rolls = await actor.rollSavingThrow(
    {
      ability: "con",
      rolls: [{ options: { target: Number(dc) } }]  // drives pass/fail colouring
    },
    {
      options: {
        window: {
          subtitle: `DC ${dc}`  // shown under the "Constitution Saving Throw" title
        }
      }
    },
    {
      data: {
        flavor: `Constitution Saving Throw (DC ${dc})`  // shown on the chat card
      }
    }
  );

  if (!rolls?.length) {
    logDebug(`Con save cancelled or returned nothing for ${actor.name}`);
    return false;
  }

  const success = rolls[0].total >= Number(dc ?? 10);
  logDebug(`Con save for ${actor.name}: rolled ${rolls[0].total} vs DC ${dc} → ${success ? "pass" : "fail"}`);
  return success;
}

// Debug logger
export function logDebug(message) {
  if (DEBUG_MODE) console.log(`Combat Exhaustion | ${message}`);
}
