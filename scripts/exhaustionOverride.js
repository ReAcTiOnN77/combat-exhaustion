// /scripts/exhaustionOverride.js
// Force 2014↔2024 Exhaustion rules without killing the UI or creating new statuses.
//
// Based on dnd5e.mjs source analysis:
//  - rulesVersion is strictly "modern" | "legacy" (no "2024"/"2014"/"v2024" variants)
//  - addRollExhaustion(parts, data): parts is string[], data is roll data object
//    - Called once per {parts,data} pair; for adv/dis multiple pairs are created
//    - Guard via WeakSet on `data` objects (same object reused per pair)
//  - Movement: system reads conditionEffects.halfMovement / noMovement + reduction.speed
//    - force2014: zero reduction.speed shim; legacy table driven by hasConditionEffect synthesis
//    - force2024: minimal prepareDerivedData wrapper applies -5ft × level
//  - hasConditionEffect: checks statuses Set AND (if legacy) synthesizes from exhaustion-N keys
//  - OVERRIDE_UPDATE_GUARD exported so main.js can check it to avoid re-entrant triggers

import { MODULE_ID } from "./main.js";

/* ─────────────────────────── Settings helpers ───────────────────────────────── */

const swapOn = () => game.settings.get(MODULE_ID, "exhaustionOverrideSwap") === true;

// dnd5e only ever stores "modern" or "legacy"
const coreIsLegacy = () => game.settings.get("dnd5e", "rulesVersion") === "legacy";
const coreIsModern = () => game.settings.get("dnd5e", "rulesVersion") === "modern";

/** core=legacy → behave like 2024 */
const force2024 = () => swapOn() && coreIsLegacy();
/** core=modern → behave like 2014 */
const force2014 = () => swapOn() && coreIsModern();

const exLevel = (actor) =>
  Number(foundry.utils.getProperty(actor, "system.attributes.exhaustion") ?? 0) || 0;

/* ─────────────────────────── Shared update guard ────────────────────────────── */
// Exported so main.js can check our updates and skip them in updateActor.

export const OVERRIDE_UPDATE_GUARD = new Set();

async function safeActorUpdate(actor, data, options = {}) {
  OVERRIDE_UPDATE_GUARD.add(actor.id);
  try {
    await actor.update(data, options);
  } finally {
    OVERRIDE_UPDATE_GUARD.delete(actor.id);
  }
}

/* ─────────────────────────── libWrapper helper ──────────────────────────────── */

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

/* ─────────────────────────── Modern reduction shim ─────────────────────────── */
// Zeroes out CONFIG.DND5E.conditionTypes.exhaustion.reduction so the system's
// prepareMovement doesn't apply the modern flat speed/roll penalty when we're in
// force2014 mode. The legacy table handles penalties via hasConditionEffect instead.

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

/* ─────────────────────────── Exhaustion UI text ─────────────────────────────── */

const REF_2024 =
  "Compendium.dnd5e.content24.JournalEntry.phbAppendixCRule.JournalEntryPage.jSQtPgNm0i4f3Qi3";
// Lazy — window.REFERENCES is set by dnd5e during init, not at parse time
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

/* ─────────────────────────── Roll guard: WeakSet on data objects ────────────── */
// addRollExhaustion(parts, data) is called once per {parts,data} pair.
// rollConfig.rolls.forEach(({parts,data}) => this.addRollExhaustion(parts,data))
// Each pair has its own distinct `data` object, so keying the guard on `data`
// ensures exactly one injection per pair with no cross-contamination.

const _rollDataApplied = new WeakSet();

/* ─────────────────────────── prepareDerivedData guard ───────────────────────── */
// WeakMap prevents double-application when dnd5e calls prepareData() multiple
// times synchronously. Cleared in a finally block — no setTimeout needed.

const _prepInProgress = new WeakMap();

/* ─────────────────────────── Core init ─────────────────────────────────────── */

export function initExhaustionOverride() {
  Hooks.once("setup", () => {

    if (force2014()) applyModernReductionShim();
    else restoreModernReductionShim();
    applyExhaustionUIText();

    /* ── 1. hasConditionEffect (MIXED) ─────────────────────────────────────────
       dnd5e source (line ~33181):
         const applyExhaustion = (level !== null) && !imms.has("exhaustion")
           && (rulesVersion === "legacy");
         return props.some(k => {
           const l = Number(k.split("-").pop());
           return (statuses.has(k) && !imms.has(k)) || (applyExhaustion && isInteger(l) && level >= l);
         });

       force2024 (core=legacy): mask the level-synthesis; return only explicit statuses
       force2014 (core=modern): synthesize as if applyExhaustion=true despite modern mode
    ────────────────────────────────────────────────────────────────────────── */
    registerWrap(
      "CONFIG.Actor.documentClass.prototype.hasConditionEffect",
      function (wrapped, key) {
        const props = CONFIG.DND5E?.conditionEffects?.[key];
        if (!props) return wrapped(key);

        // Only intercept keys that have any exhaustion-level-driven entries
        const hasLevelProps = [...props].some(k => Number.isInteger(Number(k.split("-").pop())));
        if (!hasLevelProps) return wrapped(key);

        // Short-circuit when swap is off — no need to compute anything
        if (!swapOn()) return wrapped(key);

        const statuses = this.statuses ?? new Set();
        const immRaw   = this.system?.traits?.ci?.value ?? new Set();
        const imms     = immRaw instanceof Set ? immRaw : new Set(immRaw);
        const level    = this.system?.attributes?.exhaustion ?? null;

        // Explicit: a relevant status ID is present and not immune
        const hasExplicit = [...props].some(k => statuses.has(k) && !imms.has(k));

        if (force2024()) {
          // Legacy core synthesizes level-driven effects; suppress that, keep only explicit
          return hasExplicit;
        }

        if (force2014()) {
          // Modern core doesn't synthesize; do it ourselves (legacy table logic)
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

    /* ── 2. addRollExhaustion (WRAPPER) ────────────────────────────────────────
       Actual signature: addRollExhaustion(parts: string[], data: object)
       Core calls this when rulesVersion === "modern"; injects "@exhaustion" into
       parts and sets data.exhaustion = -(level * reduction.rolls).

       force2014: core just ran and added @exhaustion; strip it (and zero reduction
         shim means the amount would be 0 anyway, but strip for safety)
       force2024: core did nothing (legacy skips this method); inject -2*lvl ourselves
    ────────────────────────────────────────────────────────────────────────── */
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
          // Core (modern) added @exhaustion with reduction.rolls * lvl;
          // cancel it since the shim zeros reduction.rolls anyway, and to be safe
          stripCore();
          return ret;
        }

        if (force2024()) {
          // Core (legacy) did nothing; inject -2×lvl flat penalty
          stripCore();
          if (Array.isArray(parts)) parts.push("@exhaustion");
          data.exhaustion = -(2 * lvl);
        }

        return ret;
      },
      "WRAPPER"
    );

    // Fallback only if the system lacks addRollExhaustion entirely (very old builds)
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

    /* ── 3. prepareDerivedData (WRAPPER) — force2024 speed penalty only ────────
       The system's prepareMovement reads conditionEffects.halfMovement for ×0.5
       and reduction.speed for the modern flat penalty.

       force2014: reduction shim zeroes reduction.speed; hasConditionEffect
         synthesizes halfMovement/noMovement. Nothing else needed here.

       force2024: 2024 rules apply -5ft × level flat, which is NOT the same as
         the conditionEffects halving system and isn't in the legacy code path.
         We apply it directly after prepareMovement has run.
    ────────────────────────────────────────────────────────────────────────── */
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

  /* ── ready: post-load normalization ─────────────────────────────────────────── */
  Hooks.once("ready", async () => {
    console.log(
      `[${MODULE_ID}] exhaustionOverride ready | ` +
      `rulesVersion=${game.settings.get("dnd5e", "rulesVersion")} | ` +
      `swapOn=${swapOn()} | force2024=${force2024()} | force2014=${force2014()}`
    );

    applyExhaustionUIText();
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Only the GM runs normalization — prevents permission errors on player clients
    // and avoids duplicate updates when multiple players own the same actor.
    if (!game.user.isGM) return;

    try {
      /* ── Legacy core → 2024 ──────────────────────────────────────────────── */
      if (force2024()) {
        // Strip any legacy AE change payloads so they don't re-apply on next load
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

        // Nudge actors so 2024 penalties apply immediately
        for (const a of game.actors ?? []) {
          if (!exLevel(a)) continue;
          await safeActorUpdate(a, { "system.attributes.exhaustion": exLevel(a) }, { diff: false });
        }
        // NOTE: do NOT call a.prepareData() manually here — midi-qol and DAE
        // cannot handle a second prepare call mid-session (causes _index redefinition
        // errors). The safeActorUpdate above already triggers a full reactive prepare.
        for (const a of game.actors ?? []) {
          try { a.render?.(false); } catch (_) {}
        }
      }

      /* ── Modern core → 2014 ──────────────────────────────────────────────── */
      if (force2014()) {
        applyModernReductionShim();
        // Nudge actors so legacy synthesis kicks in immediately
        for (const a of game.actors ?? []) {
          if (!exLevel(a)) continue;
          await safeActorUpdate(
            a,
            { "system.attributes.exhaustion": exLevel(a) },
            { diff: false, render: false }
          );
        }
        // No prepareData/render — avoids double halving/zeroing
      }
    } catch (err) {
      console.error(`${MODULE_ID} | post-load normalization failed`, err);
    }
  });

  // External callers (e.g. settings onChange) can trigger a UI text refresh
  Hooks.on("cexhaustion-reapply", () => {
    try { applyExhaustionUIText(); }
    catch (e) { console.error(`[${MODULE_ID}] tooltip swap failed (reapply)`, e); }
  });

  /* ── Visual Active Effects compatibility (optional) ──────────────────────────
     Only applied if VAE is installed and active. VAE reads `effect.description`
     synchronously before its hook fires, and uses Hooks.call() (not await), so
     async hooks are useless here. Instead we shadow `description` with a
     prototype getter on the ActiveEffect class so VAE sees the correct @Embed
     reference string at read time. Falls through to stored value when VAE is
     absent, swap is off, or the effect isn't exhaustion.
  ────────────────────────────────────────────────────────────────────────────── */
  Hooks.once("setup", () => {
    if (!game.modules.get("visual-active-effects")?.active) return;

    const AEClass = CONFIG.ActiveEffect?.documentClass;
    if (!AEClass || AEClass.prototype._cex_descriptionPatched) return;
    AEClass.prototype._cex_descriptionPatched = true;

    Object.defineProperty(AEClass.prototype, "description", {
      configurable: true,
      enumerable: true,
      get() {
        // Read stored value from whichever internal store Foundry uses
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
        // Let Foundry's document system write through to _source as normal
        if (this._source) this._source.description = value;
        else if (this._data) this._data.description = value;
      },
    });
  });
}
