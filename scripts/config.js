import { MODULE_ID } from "./main.js";

export function registerSettings() {
	game.settings.register(MODULE_ID, "exhaustionMode", {
		name: game.i18n.localize(`${MODULE_ID}.settings.exhaustionMode.name`),
		hint: game.i18n.localize(`${MODULE_ID}.settings.exhaustionMode.hint`),
		scope: "world",
		config: true,
		type: String,
		choices: {
			"afterCombat": game.i18n.localize(`${MODULE_ID}.settings.exhaustionMode.choices.afterCombat`),
			"duringCombat": game.i18n.localize(`${MODULE_ID}.settings.exhaustionMode.choices.duringCombat`),
			"always": game.i18n.localize(`${MODULE_ID}.settings.exhaustionMode.choices.always`)
		},
		default: "afterCombat",
		restricted: true
	});
}