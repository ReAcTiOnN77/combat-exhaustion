const SOCKET_EVENT = "module.combat-exhaustion";

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

/* -------------------------------------------------- */
/*  Save routing                                      */
/* -------------------------------------------------- */

const _pendingSaves = new Map(); // actorId → { resolve, timer }

export function initSaveListener() {
  game.socket.on(SOCKET_EVENT, async (data) => {

    // Player receives request and runs the roll
    if (data?.type === "saveRequest" && !game.user.isGM) {
      const actor = game.actors.get(data.actorId);
      if (!actor?.isOwner) return;

      let passed    = false;
      let messageId = null;

      // Capture the chat message ID created by the roll — scoped to this actor
      // so we don't grab a message from some other module firing during the save.
      let hookId;
      const captureHandler = (msg) => {
        if (msg?.speaker?.actor !== actor.id) return;
        messageId = msg.id;
        if (hookId !== undefined) {
          Hooks.off("createChatMessage", hookId);
          hookId = undefined;
        }
      };
      hookId = Hooks.on("createChatMessage", captureHandler);

      try {
        if (data.saveType === "conSave") {
          const rolls = await actor.rollSavingThrow(
            {
              ability: "con",
              rolls: [{ options: { target: data.dc } }]
            },
            { options: { window: { subtitle: `DC ${data.dc}` } } },
            { data: { flavor: `Constitution Saving Throw (DC ${data.dc})` } }
          );
          if (rolls?.length) passed = rolls[0].total >= data.dc;
        } else if (data.saveType === "flatD20") {
          const rolls = await CONFIG.Dice.D20Roll.build(
            { rolls: [{ options: { target: data.dc } }] },
            { configure: true, options: { window: { title: `Flat d20 — DC ${data.dc}`, subtitle: actor.name } } },
            { create: true, data: { speaker: ChatMessage.getSpeaker({ actor }), flavor: `Flat d20 Roll vs DC ${data.dc}` } }
          );
          if (rolls?.length) passed = rolls[0].total >= data.dc;
        }
      } finally {
        // If dialog was cancelled or no matching message ever fired, unhook.
        if (hookId !== undefined) Hooks.off("createChatMessage", hookId);
      }

      const emit = () => game.socket.emit(SOCKET_EVENT, {
        type:    "saveResult",
        actorId: data.actorId,
        passed
      });

      if (game.modules.get("dice-so-nice")?.active && messageId) {
        let emitted = false;
        const safeguard = setTimeout(() => { if (!emitted) { emitted = true; emit(); } }, 10_000);
        Hooks.once("diceSoNiceRollComplete", (completedId) => {
          if (completedId === messageId && !emitted) {
            emitted = true;
            clearTimeout(safeguard);
            emit();
          }
        });
      } else {
        emit();
      }
    }

    // GM receives result and resolves the pending promise
    if (data?.type === "saveResult" && game.user.isGM) {
      const pending = _pendingSaves.get(data.actorId);
      if (!pending) return;
      clearTimeout(pending.timer);
      _pendingSaves.delete(data.actorId);
      pending.resolve(data.passed);
    }
  });
}

function requestSave(actor, dc, saveType) {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      _pendingSaves.delete(actor.id);
      resolve(false);
    }, 60_000);

    _pendingSaves.set(actor.id, { resolve, timer });
    game.socket.emit(SOCKET_EVENT, { type: "saveRequest", actorId: actor.id, dc, saveType });
  });
}

function onlineOwner(actor) {
  return game.users.find(u => !u.isGM && u.active && actor.testUserPermission(u, "OWNER"));
}

/* -------------------------------------------------- */
/*  CON Save                                          */
/* -------------------------------------------------- */

export async function promptConSave(actor, dc) {
  if (onlineOwner(actor)) return requestSave(actor, dc, "conSave");

  const rolls = await actor.rollSavingThrow(
    {
      ability: "con",
      rolls: [{ options: { target: Number(dc) } }]
    },
    { options: { window: { subtitle: `DC ${dc}` } } },
    { data: { flavor: `Constitution Saving Throw (DC ${dc})` } }
  );

  if (!rolls?.length) return false;
  return rolls[0].total >= Number(dc ?? 10);
}

/* -------------------------------------------------- */
/*  Flat d20                                          */
/* -------------------------------------------------- */

export async function promptFlatD20(actor, dc) {
  if (onlineOwner(actor)) return requestSave(actor, dc, "flatD20");

  const rolls = await CONFIG.Dice.D20Roll.build(
    { rolls: [{ options: { target: dc } }] },
    { configure: true, options: { window: { title: `Flat d20 — DC ${dc}`, subtitle: actor.name } } },
    { create: true, data: { speaker: ChatMessage.getSpeaker({ actor }), flavor: `Flat d20 Roll vs DC ${dc}` } }
  );

  if (!rolls?.length) return false;
  return rolls[0].total >= dc;
}

/* -------------------------------------------------- */
/*  Exhaustion change notification                    */
/* -------------------------------------------------- */

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