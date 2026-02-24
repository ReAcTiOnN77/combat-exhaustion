import { MODULE_ID } from "./main.js";

export function registerSettings() {
  const settings = [
    {
      key: "exhaustionMode",
      options: {
        name: game.i18n.localize(`${MODULE_ID}.settings.exhaustionMode.name`),
        hint: game.i18n.localize(`${MODULE_ID}.settings.exhaustionMode.hint`),
        scope: "world",
        config: true,
        type: String,
        choices: {
          afterCombat: game.i18n.localize(`${MODULE_ID}.settings.exhaustionMode.choices.afterCombat`),
          duringCombat: game.i18n.localize(`${MODULE_ID}.settings.exhaustionMode.choices.duringCombat`),
          always: game.i18n.localize(`${MODULE_ID}.settings.exhaustionMode.choices.always`)
        },
        default: "afterCombat",
        restricted: true
      }
    },
    {
      key: "exhaustOnFirstDeathFail",
      options: {
        name: game.i18n.localize(`${MODULE_ID}.settings.exhaustOnFirstDeathFail.name`),
        hint: game.i18n.localize(`${MODULE_ID}.settings.exhaustOnFirstDeathFail.hint`),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        restricted: true
      }
    },
    {
      key: "enableConSave",
      options: {
        name: game.i18n.localize(`${MODULE_ID}.settings.enableConSave.name`),
        hint: game.i18n.localize(`${MODULE_ID}.settings.enableConSave.hint`),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        restricted: true
      }
    },
    {
      key: "baseSaveDC",
      options: {
        name: game.i18n.localize(`${MODULE_ID}.settings.baseSaveDC.name`),
        hint: game.i18n.localize(`${MODULE_ID}.settings.baseSaveDC.hint`),
        scope: "world",
        config: true,
        type: Number,
        default: 10,
        restricted: true
      }
    },
    {
      key: "afterCombatCheckMode",
      options: {
        name: game.i18n.localize(`${MODULE_ID}.settings.afterCombatCheckMode.name`),
        hint: game.i18n.localize(`${MODULE_ID}.settings.afterCombatCheckMode.hint`),
        scope: "world",
        config: true,
        type: String,
        choices: {
          disabled:          game.i18n.localize(`${MODULE_ID}.settings.afterCombatCheckMode.choices.disabled`),
          singleExhaustion:  game.i18n.localize(`${MODULE_ID}.settings.afterCombatCheckMode.choices.singleExhaustion`),
          stackedExhaustion: game.i18n.localize(`${MODULE_ID}.settings.afterCombatCheckMode.choices.stackedExhaustion`)
        },
        default: "disabled",
        restricted: true
      }
    },
    {
      key: "exhaustionOverrideSwap",
      options: {
		name: game.i18n.localize(`${MODULE_ID}.settings.exhaustionOverrideSwap.name`),
		hint: game.i18n.localize(`${MODULE_ID}.settings.exhaustionOverrideSwap.hint`),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        restricted: true,
        onChange: () => {
		  foundry.utils.debouncedReload();
		}
      }
    },
	{
	  key: "lastNotifiedVersion",
	  options: {
		scope: "world",
		config: false,
		type: String,
		default: ""
	  }
	}
  ];

  settings.forEach((setting) => game.settings.register(MODULE_ID, setting.key, setting.options));
}
