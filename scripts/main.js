export const MODULE_ID = "combat-exhaustion";
export const DEBUG_MODE = false; // Set to true for debugging, false to disable

import { isActorInCombat, updateExhaustion, promptConSave, logDebug } from "./helpers.js";
import { registerSettings } from "./config.js";

Hooks.once("init", registerSettings);

Hooks.on("ready", () => {
	console.log("Combat Exhaustion module loaded.");
});

// Track when a player actor's HP changes
Hooks.on("updateActor", async (actor, updateData) => {
	if (!actor.hasPlayerOwner && !game.user.isGM) return;
	
	const hpValue = getProperty(updateData, "system.attributes.hp.value");
	const prevHpValue = actor.getFlag(MODULE_ID, "previousHp") ?? getProperty(actor, "system.attributes.hp.value");
	const exhaustionMode = game.settings.get(MODULE_ID, "exhaustionMode");
	const exhaustOnFirstDeathFail = game.settings.get(MODULE_ID, "exhaustOnFirstDeathFail");
	const enableConSave = game.settings.get(MODULE_ID, "enableConSave");
	const baseSaveDC = parseInt(game.settings.get(MODULE_ID, "baseSaveDC"), 10);
	const singleCheckAfterCombat = game.settings.get(MODULE_ID, "singleCheckAfterCombat");
	const inCombat = isActorInCombat(actor);
	
	logDebug(`Actor updated: ${actor.name}, HP: ${hpValue}, Previous HP: ${prevHpValue}, Mode: ${exhaustionMode}, In Combat: ${inCombat}`);
	
	// Initialize variables
	let increaseTracker = false;
	
	if (hpValue > 0 && prevHpValue === 0) {
		// Reset the firstDeathFail flag when the actor is healed from 0 HP
		await actor.unsetFlag(MODULE_ID, "firstDeathFail");
		
		if (!exhaustOnFirstDeathFail) {
			increaseTracker = true; // Default to true
			if (enableConSave && !singleCheckAfterCombat && ((exhaustionMode === "duringCombat" && inCombat) || exhaustionMode === "always" || (exhaustionMode === "afterCombat" && inCombat))) {
				const success = await promptConSave(actor, baseSaveDC);
				increaseTracker = !success;
			}
			
			if (increaseTracker) {
				if (exhaustionMode === "afterCombat" && inCombat) {
					const currentTracker = actor.getFlag(MODULE_ID, "exhaustionTracker") || 0;
					const newTrackerValue = currentTracker + 1;
					logDebug(`Updating exhaustionTracker for ${actor.name} from ${currentTracker} to ${newTrackerValue}`);
					await actor.setFlag(MODULE_ID, "exhaustionTracker", newTrackerValue);
					} else if ((exhaustionMode === "duringCombat" && inCombat) || exhaustionMode === "always") {
					await updateExhaustion(actor, 1);
				}
			}
		}
	}
	
	// Track first death save failure
	if (exhaustOnFirstDeathFail && updateData.system?.attributes?.death?.failure > 0) {
		if (!actor.getFlag(MODULE_ID, "firstDeathFail")) {
			logDebug(`${actor.name} has failed a death save for the first time.`);
			await actor.setFlag(MODULE_ID, "firstDeathFail", true);
			
			increaseTracker = true; // Default to true
			if (exhaustionMode === "afterCombat" && inCombat) {
				if (enableConSave) {
					const success = await promptConSave(actor, baseSaveDC);
					increaseTracker = !success;
				}
				if (increaseTracker) {
					const currentTracker = actor.getFlag(MODULE_ID, "exhaustionTracker") || 0;
					const newTrackerValue = currentTracker + 1;
					logDebug(`Updating exhaustionTracker for ${actor.name} from ${currentTracker} to ${newTrackerValue} due to first death fail.`);
					await actor.setFlag(MODULE_ID, "exhaustionTracker", newTrackerValue);
				}
				} else if ((exhaustionMode === "duringCombat" && inCombat) || exhaustionMode === "always") {
				if (enableConSave && inCombat) {
					const success = await promptConSave(actor, baseSaveDC);
					increaseTracker = !success;
				}
				if (increaseTracker) await updateExhaustion(actor, 1);
			}
		}
	}
	
	// Update the previous HP value flag
	await actor.setFlag(MODULE_ID, "previousHp", hpValue);
});

// Add exhaustion at the end of combat
Hooks.on("deleteCombat", async (combat) => {
	const exhaustionMode = game.settings.get(MODULE_ID, "exhaustionMode");
	const enableConSave = game.settings.get(MODULE_ID, "enableConSave");
	const baseSaveDC = parseInt(game.settings.get(MODULE_ID, "baseSaveDC"), 10);
	const singleCheckAfterCombat = game.settings.get(MODULE_ID, "singleCheckAfterCombat");
	
	for (let combatant of combat.combatants) {
		const actor = combatant.actor;
		if (!actor || (!actor.hasPlayerOwner && !game.user.isGM)) continue;
		
		let addExhaustion = true; // Default to true
		
		if (exhaustionMode === "afterCombat") {
			const exhaustionTracker = actor.getFlag(MODULE_ID, "exhaustionTracker");
			if (exhaustionTracker) {
				if (enableConSave && singleCheckAfterCombat) {
					let dc = baseSaveDC + exhaustionTracker;
					const success = await promptConSave(actor, dc);
					addExhaustion = !success;
				}
				if (addExhaustion) {
					logDebug(`Adding ${exhaustionTracker} exhaustion point(s) to ${actor.name} after combat.`);
					await updateExhaustion(actor, exhaustionTracker);
				}
			}
		}
		await actor.setFlag(MODULE_ID, "exhaustionTracker", 0); // Reset the exhaustion tracker to 0
		await actor.setFlag(MODULE_ID, "previousHp", 0); // Reset the previous HP flag to 0
	}
});
