/* -------------------------------------------------- */
/*  Constants                                         */
/* -------------------------------------------------- */

const SOCKET_EVENT = "module.combat-exhaustion";

const TIERS = [
  { id: "standard", label: "combat-exhaustion.rest.tiers.standard.label", description: "combat-exhaustion.rest.tiers.standard.description", recovery: 1 },
  { id: "comfortable", label: "combat-exhaustion.rest.tiers.quality.label", description: "combat-exhaustion.rest.tiers.quality.description", recovery: 2 },
  { id: "luxury",   label: "combat-exhaustion.rest.tiers.luxury.label",   description: "combat-exhaustion.rest.tiers.luxury.description",   recovery: 3 }
];

// Localized once per dialog open, not at module parse time
function localizedTiers() {
  return TIERS.map(t => ({
    ...t,
    label:       game.i18n.localize(t.label),
    description: game.i18n.localize(t.description)
  }));
}

/* -------------------------------------------------- */
/*  Quality map                                       */
/* -------------------------------------------------- */

let _qualityMap = {};
let _clearTimer = null;

function setActorQuality(actorId, recovery) {
  if (recovery != null) _qualityMap[actorId] = recovery;
}

function getActorQuality(actorId) {
  return _qualityMap[actorId] ?? null;
}

function clearQualityMap() {
  _qualityMap = {};
  clearTimeout(_clearTimer);
  _clearTimer = null;
}

function armClearTimer() {
  clearTimeout(_clearTimer);
  _clearTimer = setTimeout(clearQualityMap, 60_000);
}

/* -------------------------------------------------- */
/*  Socket wait                                       */
/* -------------------------------------------------- */

let _pendingResolve = null;
let _pendingTimer   = null;

function waitForQuality(timeoutMs = 30_000) {
  return new Promise(resolve => {
    _pendingResolve = resolve;
    _pendingTimer   = setTimeout(() => {
      _pendingResolve = null;
      resolve({ cancelled: false });
    }, timeoutMs);
  });
}

function resolveWaiting(cancelled = false) {
  if (_pendingResolve) {
    clearTimeout(_pendingTimer);
    const fn = _pendingResolve;
    _pendingResolve = null;
    fn({ cancelled });
  }
}

/* -------------------------------------------------- */
/*  Dialog helpers                                    */
/* -------------------------------------------------- */

function buildDialogContent(nameLeft) {
  const tiers   = localizedTiers();
  const suffix  = game.i18n.localize("combat-exhaustion.rest.exhaustionSuffix");
  const hints   = tiers.map(t =>
    `<li><strong>${t.label}:</strong> ${t.description} <em>(–${t.recovery} ${suffix})</em></li>`
  ).join("");
  const options = tiers.map(t =>
    `<option value="${t.id}">${t.label} (–${t.recovery})</option>`
  ).join("");

  return {
    html: `
      <p style="margin-bottom:4px"><strong>${game.i18n.localize("combat-exhaustion.rest.restTypeHeader")}</strong></p>
      <ul style="margin:0 0 8px 0;padding-left:16px;font-size:0.85em;opacity:0.8;white-space:normal;word-break:break-word;max-width:420px">${hints}</ul>
      <hr style="margin:6px 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:0.85em;opacity:0.7;text-transform:uppercase;letter-spacing:0.05em">${nameLeft}</span>
        <span style="font-size:0.85em;opacity:0.7;text-transform:uppercase;letter-spacing:0.05em">${game.i18n.localize("combat-exhaustion.rest.restQualityHeader")}</span>
      </div>
    `,
    options,
    tiers
  };
}

function dialogButtons(confirmCallback) {
  return [
    {
      action: "confirm",
      label: game.i18n.localize("combat-exhaustion.rest.confirm"),
      icon: "fa-solid fa-check",
      default: true,
      callback: confirmCallback
    },
    {
      action: "cancel",
      label: game.i18n.localize("combat-exhaustion.rest.cancelRest"),
      icon: "fa-solid fa-xmark"
    }
  ];
}

async function showSingleActorDialog(actorName) {
  const { html, options, tiers } = buildDialogContent(actorName);
  let selectedTierId = "standard";

  const content = html + `
    <div style="display:flex;align-items:center;gap:8px;margin:4px 0">
      <span style="flex:1;font-weight:bold">${actorName}</span>
      <select id="cex-single-quality" style="flex:1">${options}</select>
    </div>
  `;

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("combat-exhaustion.rest.dialogTitle") },
    content,
    buttons: dialogButtons((_e, _b, dialog) => {
      selectedTierId = dialog.element.querySelector("#cex-single-quality")?.value ?? "standard";
      return "confirm";
    }),
    rejectClose: false
  });

  if (!choice || choice === "cancel") return "cancel";
  return tiers.find(t => t.id === selectedTierId)?.recovery ?? 1;
}

async function showBatchQualityDialog(actors) {
  const { html, options, tiers } = buildDialogContent(game.i18n.localize("combat-exhaustion.rest.playersHeader"));
  const selections = {};
  actors.forEach(a => { selections[a.id] = "standard"; });

  const rows = actors.map(actor => `
    <div style="display:flex;align-items:center;gap:8px;margin:4px 0">
      <span style="flex:1;font-weight:bold">${actor.name}</span>
      <select data-cex-actor="${actor.id}" style="flex:1">${options}</select>
    </div>
  `).join("");

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("combat-exhaustion.rest.dialogTitle") },
    content: html + rows,
    buttons: dialogButtons((_e, _b, dialog) => {
      dialog.element.querySelectorAll("select[data-cex-actor]").forEach(sel => {
        selections[sel.dataset.cexActor] = sel.value;
      });
      return "confirm";
    }),
    rejectClose: false
  });

  if (!result || result === "cancel") return "cancel";

  const map = {};
  for (const [actorId, tierId] of Object.entries(selections)) {
    map[actorId] = tiers.find(t => t.id === tierId)?.recovery ?? 1;
  }
  return map;
}

/* -------------------------------------------------- */
/*  Init                                              */
/* -------------------------------------------------- */

export function initLongRestQuality() {

  Hooks.once("ready", () => {

    game.socket.on(SOCKET_EVENT, async (data) => {
      if (data?.type === "restQualityBatch") {
        Object.assign(_qualityMap, data.map);
        armClearTimer();
        resolveWaiting(false);
      } else if (data?.type === "restQuality") {
        if (data.actorId && data.recovery != null) {
          setActorQuality(data.actorId, data.recovery);
          armClearTimer();
        }
        resolveWaiting(false);
      } else if (data?.type === "restCancelled") {
        resolveWaiting(true);
      } else if (data?.type === "restQualityRequest" && game.user.isGM) {
        const activeGMs = game.users.filter(u => u.isGM && u.active).sort((a, b) => a.id < b.id ? -1 : 1);
        if (activeGMs[0]?.id !== game.user.id) return;

        const actor = await fromUuid(data.actorUuid).catch(() => null)
          ?? game.actors.get(data.actorId);
        if (!actor) return;

        const recovery = await showSingleActorDialog(actor.name);
        if (recovery === "cancel") {
          game.socket.emit(SOCKET_EVENT, { type: "restCancelled", actorId: data.actorId });
          return;
        }
        setActorQuality(data.actorId, recovery);
        armClearTimer();
        game.socket.emit(SOCKET_EVENT, { type: "restQuality", actorId: data.actorId, recovery });
      }
    });

    /* -------------------------------------------------- */
    /*  longRest prototype wrap                           */
    /* -------------------------------------------------- */

    let proto = CONFIG.Actor?.documentClass?.prototype;
    while (proto && !Object.prototype.hasOwnProperty.call(proto, "longRest")) {
      proto = Object.getPrototypeOf(proto);
    }

    if (proto && !proto._cex_longRest_patched) {
      proto._cex_longRest_patched = true;
      const _orig = proto.longRest;

      proto.longRest = async function (config = {}, options = {}) {
        const alreadyQueued = getActorQuality(this.id) !== null;
        let cancelled = false;

        if (!alreadyQueued) {
          if (config.request && game.modules.get("rest-recovery")?.active) {
            // quality map populated via socket before doRest was called
          } else if (game.user.isGM) {
            const recovery = await showSingleActorDialog(this.name);
            if (recovery === "cancel") cancelled = true;
            else { setActorQuality(this.id, recovery); armClearTimer(); }
          } else {
            game.socket.emit(SOCKET_EVENT, {
              type: "restQualityRequest",
              actorId: this.id,
              actorUuid: this.uuid
            });
            const result = await waitForQuality(30_000);
            if (result?.cancelled) cancelled = true;
          }
        }

        if (cancelled) return null;
        return _orig.call(this, config, options);
      };
    }
  });

  /* -------------------------------------------------- */
  /*  Rest Recovery: intercept Long Rest button         */
  /* -------------------------------------------------- */

  if (game.modules.get("rest-recovery")?.active) {
    const bindRestRecovery = (app, html) => {
      if (!game.user.isGM) return;
      const el = html instanceof HTMLElement ? html : html[0];
      if (!el) return;
      if (
        !el.classList?.contains("rest-recovery-request-app") &&
        !el.closest?.(".rest-recovery-request-app")
      ) return;

      const longRestBtn = el.querySelector("[data-action='longRest']");
      if (!longRestBtn || longRestBtn._cex_bound) return;
      longRestBtn._cex_bound = true;

      longRestBtn.addEventListener("click", async (event) => {
        event.stopImmediatePropagation();
        event.preventDefault();

        const actorIds = [...el.querySelectorAll("select[id^='config-actor-']")]
          .map(s => s.value).filter(Boolean);
        const actors = actorIds.map(id => game.actors.get(id)).filter(Boolean);

        if (actors.length > 0) {
          const map = await showBatchQualityDialog(actors);
          if (map === "cancel") { app.close(); return; }
          if (map) {
            Object.assign(_qualityMap, map);
            armClearTimer();
            game.socket.emit(SOCKET_EVENT, { type: "restQualityBatch", map });
          }
        }

        app.doRest("long");
      }, { capture: true });
    };

    Hooks.on("renderPromptRestApplication", bindRestRecovery);
    Hooks.on("renderApplication", bindRestRecovery);
  }

  /* -------------------------------------------------- */
  /*  Apply quality on rest completion                  */
  /* -------------------------------------------------- */

  Hooks.on("dnd5e.preRestCompleted", (actor, result, config) => {
    if (config?.type !== "long") return;

    const recovery = getActorQuality(actor.id);
    if (recovery == null) return;

    delete _qualityMap[actor.id];
    if (Object.keys(_qualityMap).length === 0) clearQualityMap();

    // Patch CONFIG delta so Rest Recovery's async _handleExhaustion reads our value
    const rt = CONFIG.DND5E?.restTypes?.long;
    let origDelta = null;
    if (rt) {
      origDelta = rt.exhaustionDelta;
      rt.exhaustionDelta = -Math.abs(recovery);
    }

    const current = foundry.utils.getProperty(actor, "system.attributes.exhaustion") ?? 0;
    const next    = Math.max(0, current - recovery);
    if (Number.isInteger(next)) {
      foundry.utils.mergeObject(result.updateData, {
        "system.attributes.exhaustion": next
      });
    }

    if (rt && origDelta !== null) {
      setTimeout(() => { rt.exhaustionDelta = origDelta; }, 500);
    }
  });
}