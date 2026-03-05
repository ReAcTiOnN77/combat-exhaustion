export function isActorInCombat(actor) {
  return game.combats.some(
    (combat) => combat.started && combat.combatants.some((c) => c.actorId === actor.id)
  );
}

export async function updateExhaustion(actor, amount) {
  let exhaustion = parseInt(
    foundry.utils.getProperty(actor, "system.attributes.exhaustion") ?? 0, 10
  );
  const max  = CONFIG.DND5E.conditionTypes?.exhaustion?.levels ?? 6;
  const next = Math.clamp(exhaustion + amount, 0, max);

  if (!Number.isInteger(next)) return;

  try {
    await actor.update({ "system.attributes.exhaustion": next });
    await notifyExhaustionChange(actor, exhaustion, next);
  } catch (error) {
    console.error(error);
  }
}

export async function promptConSave(actor, dc) {
  const rolls = await actor.rollSavingThrow(
    {
      ability: "con",
      rolls: [{ options: { target: Number(dc) } }]
    },
    {
      options: {
        window: { subtitle: `DC ${dc}` }
      }
    },
    {
      data: {
        flavor: `Constitution Saving Throw (DC ${dc})`
      }
    }
  );

  if (!rolls?.length) return false;
  return rolls[0].total >= Number(dc ?? 10);
}

export async function promptFlatD20(actor, dc) {
  const roll   = await new Roll("1d20").evaluate();
  const passed = roll.total >= dc;

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor:  `Flat d20 Roll vs DC ${dc} — ${passed ? "Success" : "Failure"}`
  });

  return passed;
}

export async function notifyExhaustionChange(actor, previous, next) {
  if (next === previous) return;

  const change  = next - previous;
  const gained  = change > 0;
  const count   = Math.abs(change);
  const key     = gained ? "combat-exhaustion.notifications.exhaustionGained" : "combat-exhaustion.notifications.exhaustionRecovered";
  const message = game.i18n.format(key, { name: actor.name, count, s: count > 1 ? "s" : "", prev: previous, next });
  const icon    = gained ? "🔴" : "🟢";

  const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
  if (!owners.length) return;

  await ChatMessage.create({
    speaker: { alias: "Combat Exhaustion" },
    whisper: owners.map(u => u.id),
    content: `<p>${icon} <strong>${message}</strong></p>`
  });
}
