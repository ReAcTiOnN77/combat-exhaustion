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
        type: Number,        // <— numeric, not string
        default: 10,
        restricted: true
      }
    },
    {
      key: "singleCheckAfterCombat",
      options: {
        name: game.i18n.localize(`${MODULE_ID}.settings.singleCheckAfterCombat.name`),
        hint: game.i18n.localize(`${MODULE_ID}.settings.singleCheckAfterCombat.hint`),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        restricted: true
      }
    }
  ];

  settings.forEach((setting) => game.settings.register(MODULE_ID, setting.key, setting.options));
}
