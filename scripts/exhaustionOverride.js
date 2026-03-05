import { MODULE_ID } from "./main.js";

/* -------------------------------------------------- */
/*  Settings helpers                                  */
/* -------------------------------------------------- */

const swapOn     = () => game.settings.get(MODULE_ID, "exhaustionOverrideSwap") === true;
const coreIsLegacy = () => game.settings.get("dnd5e", "rulesVersion") === "legacy";
const coreIsModern = () => game.settings.get("dnd5e", "rulesVersion") === "modern";
const force2024  = () => swapOn() && coreIsLegacy();
const force2014  = () => swapOn() && coreIsModern();
const exLevel    = (actor) =>
  Number(foundry.utils.getProperty(actor, "system.attributes.exhaustion") ?? 0) || 0;

/* -------------------------------------------------- */
/*  Shared update guard                               */
/* -------------------------------------------------- */

export const OVERRIDE_UPDATE_GUARD = new Set();

async function safeActorUpdate(actor, data, options = {}) {
  OVERRIDE_UPDATE_GUARD.add(actor.id);
  try {
    await actor.update(data, options);
  } finally {
    OVERRIDE_UPDATE_GUARD.delete(actor.id);
  }
}

/* -------------------------------------------------- */
/*  libWrapper helper                                 */
/* -------------------------------------------------- */

function registerWrap(target, fn, type = "WRAPPER") {
  const useLib = !!game.modules.get("lib-wrapper")?.active && window.libWrapper;
  if (useLib) return libWrapper.register(MODULE_ID, target, fn, type);

  const [objPath, method] = target.split(".prototype.");
  const obj = objPath.split(".").reduce((o, k) => o?.[k], window);
  if (!obj?.prototype) return;
  const sentinel = `_cex_${method}_patched`;
  if (obj.prototype[sentinel]) return;
  obj.prototype[sentinel] = true;
  const original = obj.prototype[method];
  obj.prototype[method] = function (...args) {
    return fn.call(this, original.bind(this), ...args);
  };
}

/* -------------------------------------------------- */
/*  Modern reduction shim                             */
/* -------------------------------------------------- */

let _origReduction = null;

function applyModernReductionShim() {
  const ct = CONFIG.DND5E?.conditionTypes?.exhaustion;
  if (!ct || _origReduction) return;
  const r = ct.reduction ?? { rolls: 2, speed: 5 };
  _origReduction = { rolls: r.rolls ?? 2, speed: r.speed ?? 5 };
  ct.reduction = { rolls: 0, speed: 0 };
}

function restoreModernReductionShim() {
  const ct = CONFIG.DND5E?.conditionTypes?.exhaustion;
  if (!ct || !_origReduction) return;
  ct.reduction = { ..._origReduction };
  _origReduction = null;
}

/* -------------------------------------------------- */
/*  Exhaustion UI text                                */
/* -------------------------------------------------- */

const REF_2024 =
  "Compendium.dnd5e.content24.JournalEntry.phbAppendixCRule.JournalEntryPage.jSQtPgNm0i4f3Qi3";
const REF_2014 = () =>
  window.REFERENCES?.conditionTypes?.exhaustion ??
  "Compendium.dnd5e.rules.JournalEntry.w7eitkpD7QQTB6j0.JournalEntryPage.cspWveykstnu3Zcv";

let _origRef  = null;
let _origName = null;

function applyExhaustionUIText() {
  const ct = CONFIG?.DND5E?.conditionTypes?.exhaustion;
  if (!ct) return;

  if (_origRef  === null) _origRef  = ct.reference ?? null;
  if (_origName === null) _origName = ct.name ?? "DND5E.ConExhaustion";

  if (force2024()) {
    ct.name      = game.i18n.localize(`${MODULE_ID}.ui.exhaustion2024`);
    ct.reference = REF_2024;
    delete ct.description;
  } else if (force2014()) {
    ct.name      = game.i18n.localize(`${MODULE_ID}.ui.exhaustion2014`);
    ct.reference = REF_2014();
    delete ct.description;
  } else {
    ct.name = _origName ?? "DND5E.ConExhaustion";
    if (_origRef) ct.reference = _origRef;
    else delete ct.reference;
    delete ct.description;
  }

  try { game.dnd5e?.effects?.rebuild?.(); } catch (_) {}
  try { game.dnd5e?.rules?.rebuildConditionEffects?.(); } catch (_) {}
}

/* -------------------------------------------------- */
/*  Roll / prepare guards                             */
/* -------------------------------------------------- */

const _rollDataApplied = new WeakSet();
const _prepInProgress  = new WeakMap();

/* -------------------------------------------------- */
/*  Init                                              */
/* -------------------------------------------------- */

export function initExhaustionOverride() {
  Hooks.once("setup", () => {

    if (force2014()) applyModernReductionShim();
    else restoreModernReductionShim();
    applyExhaustionUIText();

    registerWrap(
      "CONFIG.Actor.documentClass.prototype.hasConditionEffect",
      function (wrapped, key) {
        const props = CONFIG.DND5E?.conditionEffects?.[key];
        if (!props) return wrapped(key);

        const hasLevelProps = [...props].some(k => Number.isInteger(Number(k.split("-").pop())));
        if (!hasLevelProps) return wrapped(key);
        if (!swapOn()) return wrapped(key);

        const statuses = this.statuses ?? new Set();
        const immRaw   = this.system?.traits?.ci?.value ?? new Set();
        const imms     = immRaw instanceof Set ? immRaw : new Set(immRaw);
        const level    = this.system?.attributes?.exhaustion ?? null;
        const hasExplicit = [...props].some(k => statuses.has(k) && !imms.has(k));

        if (force2024()) return hasExplicit;

        if (force2014()) {
          if (imms.has("exhaustion")) return hasExplicit;
          const synthesized = level !== null && [...props].some(k => {
            const l = Number(k.split("-").pop());
            return Number.isInteger(l) && level >= l;
          });
          return hasExplicit || synthesized;
        }

        return wrapped(key);
      },
      "MIXED"
    );

    registerWrap(
      "CONFIG.Actor.documentClass.prototype.addRollExhaustion",
      function (wrapped, parts, data = {}) {
        const ret = wrapped(parts, data);
        if (!swapOn()) return ret;

        const lvl = exLevel(this);
        if (!lvl) return ret;
        if (_rollDataApplied.has(data)) return ret;
        _rollDataApplied.add(data);

        const stripCore = () => {
          if (Array.isArray(parts)) {
            for (let i = parts.length - 1; i >= 0; i--) {
              if (parts[i] === "@exhaustion") parts.splice(i, 1);
            }
          }
          if (typeof data.exhaustion === "number") data.exhaustion = 0;
        };

        if (force2014()) {
          stripCore();
          return ret;
        }

        if (force2024()) {
          stripCore();
          if (Array.isArray(parts)) parts.push("@exhaustion");
          data.exhaustion = -(2 * lvl);
        }

        return ret;
      },
      "WRAPPER"
    );

    if (typeof CONFIG.Actor?.documentClass?.prototype?.addRollExhaustion !== "function") {
      Hooks.on("dnd5e.preRoll", (actor, rollConfig = {}) => {
        if (!force2024()) return;
        const lvl = exLevel(actor);
        if (lvl <= 0) return;
        if (_rollDataApplied.has(rollConfig)) return;
        _rollDataApplied.add(rollConfig);
        const parts = rollConfig.parts ?? (rollConfig.parts = []);
        parts.push(-(2 * lvl));
        rollConfig.flavor = [rollConfig.flavor, `Exhausted (2024): ${-(2 * lvl)}`]
          .filter(Boolean).join(" • ");
        if (typeof rollConfig.disadvantage === "boolean") rollConfig.disadvantage = false;
      });
    }

    registerWrap(
      "CONFIG.Actor.documentClass.prototype.prepareDerivedData",
      function (wrapped, ...args) {
        if (_prepInProgress.get(this)) return wrapped(...args);
        _prepInProgress.set(this, true);
        try {
          const out = wrapped(...args);
          if (!force2024()) return out;

          const lvl = exLevel(this);
          if (!lvl) return out;

          const mv = this.system?.attributes?.movement;
          if (!mv) return out;

          const reduction = 5 * lvl;
          for (const k of Object.keys(CONFIG.DND5E?.movementTypes ?? {})) {
            const cur = Number(mv[k] ?? 0);
            if (Number.isFinite(cur) && cur > 0) mv[k] = Math.max(0, cur - reduction);
          }

          return out;
        } finally {
          _prepInProgress.delete(this);
        }
      },
      "WRAPPER"
    );
  });

  /* -------------------------------------------------- */
  /*  Ready: post-load normalization                    */
  /* -------------------------------------------------- */

  Hooks.once("ready", async () => {
    applyExhaustionUIText();
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    if (!game.user.isGM) return;

    try {
      if (force2024()) {
        for (const a of game.actors ?? []) {
          for (const eff of a.effects ?? []) {
            const e = eff?.toObject?.() ?? eff;
            const isExh =
              e?.flags?.core?.statusId       === "exhaustion" ||
              e?.flags?.dnd5e?.conditionId   === "exhaustion" ||
              e?.flags?.dnd5e?.conditionType === "exhaustion" ||
              String(e?.name ?? "").toLowerCase().includes("exhaust");
            if (!isExh) continue;
            if (Array.isArray(eff.changes) && eff.changes.length) {
              OVERRIDE_UPDATE_GUARD.add(a.id);
              try { await eff.update({ changes: [] }); }
              catch (_) {}
              finally { OVERRIDE_UPDATE_GUARD.delete(a.id); }
            }
          }
        }
        await sleep(10);

        for (const a of game.actors ?? []) {
          if (!exLevel(a)) continue;
          await safeActorUpdate(a, { "system.attributes.exhaustion": exLevel(a) }, { diff: false });
        }
        for (const a of game.actors ?? []) {
          try { a.render?.(false); } catch (_) {}
        }
      }

      if (force2014()) {
        applyModernReductionShim();
        for (const a of game.actors ?? []) {
          if (!exLevel(a)) continue;
          await safeActorUpdate(
            a,
            { "system.attributes.exhaustion": exLevel(a) },
            { diff: false, render: false }
          );
        }
      }
    } catch (err) {
      console.error(`${MODULE_ID} | post-load normalization failed`, err);
    }
  });

  Hooks.on("cexhaustion-reapply", () => {
    try { applyExhaustionUIText(); }
    catch (e) { console.error(`[${MODULE_ID}] tooltip swap failed`, e); }
  });

  /* -------------------------------------------------- */
  /*  Visual Active Effects compatibility               */
  /* -------------------------------------------------- */

  Hooks.once("setup", () => {
    if (!game.modules.get("visual-active-effects")?.active) return;

    const AEClass = CONFIG.ActiveEffect?.documentClass;
    if (!AEClass || AEClass.prototype._cex_descriptionPatched) return;
    AEClass.prototype._cex_descriptionPatched = true;

    Object.defineProperty(AEClass.prototype, "description", {
      configurable: true,
      enumerable: true,
      get() {
        const stored = this._source?.description ?? this._data?.description ?? "";
        if (!swapOn()) return stored;

        const isExhaustion =
          this.flags?.dnd5e?.conditionId   === "exhaustion" ||
          this.flags?.dnd5e?.conditionType === "exhaustion" ||
          this.flags?.core?.statusId       === "exhaustion" ||
          String(this.name ?? "").toLowerCase().includes("exhaust");

        if (!isExhaustion) return stored;

        const ref = force2024() ? REF_2024 : force2014() ? REF_2014() : null;
        return ref ? `@Embed[${ref} inline]` : stored;
      },
      set(value) {
        if (this._source) this._source.description = value;
        else if (this._data) this._data.description = value;
      },
    });
  });
}
