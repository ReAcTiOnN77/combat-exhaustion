// /scripts/exhaustionOverride.js
// Force 2014↔2024 Exhaustion rules without killing the UI or creating new statuses.

const MODULE_ID = "combat-exhaustion";

/* ---------------- Settings & version helpers ---------------- */
const swapOn       = () => game.settings.get(MODULE_ID, "exhaustionOverrideSwap") === true;
const rulesVersion = () => String(game.settings.get("dnd5e", "rulesVersion") ?? "").toLowerCase();
const coreIsModern = () => ["modern", "2024", "v2024"].includes(rulesVersion());
const coreIsLegacy = () => ["legacy", "2014", "v2014", ""].includes(rulesVersion());

const force2024 = () => swapOn() && coreIsLegacy(); // core=2014 → behave like 2024
const force2014 = () => swapOn() && coreIsModern(); // core=2024 → behave like 2014
const exLevel    = (a) => Number(foundry.utils.getProperty(a, "system.attributes.exhaustion") ?? 0) || 0;

/* Legacy “condition effects” driven by Exhaustion levels */
const LEGACY_EXH_KEYS = new Set([
  "abilityCheckDisadvantage", // L1
  "halfMovement",             // L2
  "attackDisadvantage",       // L3
  "abilitySaveDisadvantage",  // L3
  "halfHealth",               // L4
  "noMovement"                // L5
]);

/* ---------------- libWrapper helper ---------------- */
function registerWrap(target, fn, type = "WRAPPER") {
  const useLib = !!game.modules.get("lib-wrapper")?.active && window.libWrapper;
  if (useLib) return libWrapper.register(MODULE_ID, target, fn, type);

  // Fallback: direct patch
  const [objPath, method] = target.split(".prototype.");
  const obj = objPath.split(".").reduce((o, k) => o?.[k], window);
  if (!obj?.prototype) return;
  const key = `_cex_${method}_wrapped`;
  if (obj.prototype[key]) return;
  obj.prototype[key] = true;
  const original = obj.prototype[method];
  obj.prototype[method] = function (...args) { return fn.call(this, original.bind(this), ...args); };
}

const actorClass = () => CONFIG.Actor?.documentClass;
const hasAddExhaustion = () => typeof actorClass()?.prototype?.addRollExhaustion === "function";

/* ---------------- Modern (2024) reduction shim ----------------
   When forcing 2014 on a modern core, zero-out modern reductions so
   only legacy table (via hasConditionEffect) applies. */
let ORIG_REDUCTION = null;
function applyModernReductionShim() {
  const ct = (CONFIG.DND5E?.conditionTypes ?? {}).exhaustion;
  if (!(force2014() && coreIsModern() && ct)) return;
  if (!ORIG_REDUCTION) {
    const r = ct.reduction ?? { rolls: 2, speed: 5 };
    ORIG_REDUCTION = { rolls: r.rolls ?? 2, speed: r.speed ?? 5 };
  }
  ct.reduction = { rolls: 0, speed: 0 };
}
function restoreModernReductionShimIfNeeded() {
  const ct = (CONFIG.DND5E?.conditionTypes ?? {}).exhaustion;
  if (!ct || !ORIG_REDUCTION) return;
  ct.reduction = { ...ORIG_REDUCTION };
  ORIG_REDUCTION = null;
}


/* ---------- Exhaustion UI tooltip/label swap (2014 ↔ 2024) ---------- */
let _CEX_ORIG_REF  = null;
let _CEX_ORIG_NAME = null;

const REF_2024 =
  "Compendium.dnd5e.content24.JournalEntry.phbAppendixCRule.JournalEntryPage.jSQtPgNm0i4f3Qi3";
const REF_2014 =
  (window.REFERENCES?.conditionTypes?.exhaustion)
  || "Compendium.dnd5e.rules.JournalEntry.w7eitkpD7QQTB6j0.JournalEntryPage.cspWveykstnu3Zcv";


function _applyExhaustionUIText() {
  const ct = CONFIG?.DND5E?.conditionTypes?.exhaustion;
  if (!ct) return;

  // Cache originals once so we can restore when override is off
  if (_CEX_ORIG_REF  === null) _CEX_ORIG_REF  = ct.reference ?? null;
  if (_CEX_ORIG_NAME === null) _CEX_ORIG_NAME = ct.name ?? "DND5E.ConExhaustion";

  if (swapOn() && force2024() && coreIsLegacy()) {
    // legacy core → show 2024 text
    ct.name = game.i18n.localize(`${MODULE_ID}.ui.exhaustion2024`);
    ct.reference = REF_2024;
    if ("description" in ct) delete ct.description; // ensure VAE uses reference, not HTML
  } else if (swapOn() && force2014() && coreIsModern()) {
    // modern core → show 2014 text
    ct.name = game.i18n.localize(`${MODULE_ID}.ui.exhaustion2014`);
    ct.reference = REF_2014;
    if ("description" in ct) delete ct.description;
  } else {
    // No override → restore system defaults
    ct.name = _CEX_ORIG_NAME ?? "DND5E.ConExhaustion";
    if (_CEX_ORIG_REF) ct.reference = _CEX_ORIG_REF; else delete ct.reference;
    if ("description" in ct) delete ct.description;
  }

  // Nudge any internal caches so popovers refresh
  try {
    if (game.dnd5e?.effects?.rebuild) game.dnd5e.effects.rebuild();
    if (game.dnd5e?.rules?.rebuildConditionEffects) game.dnd5e.rules.rebuildConditionEffects();
  } catch (_) {}
}




/* ---------------- Core logic ---------------- */
export function initExhaustionOverride() {
  Hooks.once("setup", () => {

    // Ensure the shim matches the chosen direction at startup
    if (force2014() && coreIsModern()) applyModernReductionShim();
    else restoreModernReductionShimIfNeeded();

    // Apply UI text for the popover now (and again on ready)
    _applyExhaustionUIText();

    // 1) hasConditionEffect — BOTH directions (MIXED)
    registerWrap(
      "CONFIG.Actor.documentClass.prototype.hasConditionEffect",
      function (wrapped, key) {
        if (!LEGACY_EXH_KEYS.has(key)) return wrapped(key);

        const statuses = this.statuses ?? new Set();
        const props    = CONFIG.DND5E?.conditionEffects?.[key] ?? new Set();
        const immVal   = this.system?.traits?.ci?.value ?? [];
        const imms     = immVal instanceof Set ? immVal : new Set(immVal);
        const level    = this.system?.attributes?.exhaustion ?? null;

        const hasExplicit = (() => {
          for (const id of props) if (statuses.has(id) && !imms.has(id)) return true;
          return false;
        })();

        // legacy core → 2024: mask legacy synthesis, honor only explicit statuses
        if (force2024() && coreIsLegacy()) return hasExplicit;

        // modern core → 2014: synthesize legacy table like legacy did
        if (force2014() && coreIsModern()) {
          if (imms.has("exhaustion")) return hasExplicit;
          let synthesized = false;
          if (level !== null) {
            for (const id of props) {
              const l = Number(String(id).split("-").pop());
              if (Number.isInteger(l) && level >= l) { synthesized = true; break; }
            }
          }
          return hasExplicit || synthesized;
        }

        return wrapped(key);
      },
      "MIXED"
    );

    // 2) Apply or cancel d20 test penalties (WRAPPER semantics)
    registerWrap(
      "CONFIG.Actor.documentClass.prototype.addRollExhaustion",
      function (wrapped, parts, data = {}) {
        // Let core mutate first so we can adjust cleanly.
        const ret = wrapped(parts, data);
        if (!swapOn()) return ret;

        const lvl = exLevel(this);
        if (!lvl) return ret;

        // per-roll guard to prevent duplicate 2024 injection
        data.flags ??= {};
        data.flags[MODULE_ID] ??= {};
        if (data.flags[MODULE_ID].applied2024 === true) return ret;

        const stripCore = () => {
          if (Array.isArray(parts)) {
            for (let i = parts.length - 1; i >= 0; i--) if (parts[i] === "@exhaustion") parts.splice(i, 1);
          }
          if (typeof data.exhaustion === "number") data.exhaustion = 0;
        };

        if (force2014()) {
          // Core (modern) added −2×lvl; cancel it so legacy table can stand alone.
          stripCore();
          return ret;
        }

        if (force2024()) {
          // Core (legacy) added nothing; inject −2×lvl exactly once.
          stripCore();
          const amt = 2 * lvl;
          if (Array.isArray(parts)) parts.push(-amt);
          data.exhaustion = -amt;
          data.flags[MODULE_ID].applied2024 = true;
        }
        return ret;
      },
      "WRAPPER"
    );

    // Fallback ONLY if system lacks addRollExhaustion (avoid double-injection)
    if (!hasAddExhaustion()) {
      Hooks.on("dnd5e.preRoll", (actor, rollConfig = {}) => {
        if (!(swapOn() && force2024() && coreIsLegacy())) return;
        const lvl = exLevel(actor);
        if (lvl <= 0) return;
        rollConfig.flags ??= {}; rollConfig.flags[MODULE_ID] ??= {};
        if (rollConfig.flags[MODULE_ID].applied2024 === true) return;
        const parts = rollConfig.parts ?? (rollConfig.parts = []);
        const amt = -(2 * lvl);
        if (!parts.some(p => p === amt)) parts.push(amt);
        rollConfig.flags[MODULE_ID].applied2024 = true;
        rollConfig.flavor = [rollConfig.flavor, `Exhausted (2024): ${amt}`].filter(Boolean).join(" • ");
        if (typeof rollConfig.disadvantage === "boolean") rollConfig.disadvantage = false;
      });
    }

    // 3) Movement adjust (WRAPPER) with single-pass guard
    registerWrap(
      "CONFIG.Actor.documentClass.prototype.prepareDerivedData",
      function (wrapped, ...args) {
        const out = wrapped(...args);
        if (!swapOn()) return out;

        const lvl = exLevel(this);
        if (!lvl) return out;

        const mv = this.system?.attributes?.movement;
        if (!mv) return out;

        // one-pass guard to avoid double math in the same prepare cycle
        this.flags ??= {};
        this.flags[MODULE_ID] ??= {};
        if (this.flags[MODULE_ID]._movedThisPrepare) return out;
        this.flags[MODULE_ID]._movedThisPrepare = true;

        const keys = ["walk", "fly", "swim", "climb", "burrow"];

        if (force2024() && coreIsLegacy()) {
          // legacy core → apply −5 ft × level
          for (const k of keys) {
            const cur = Number(mv[k] ?? 0);
            if (Number.isFinite(cur)) mv[k] = Math.max(0, cur - 5 * lvl);
          }
        } else if (force2014() && coreIsModern()) {
          // modern core reductions are disabled by the shim; don't touch speeds here.
          // Halving/zeroing comes from hasConditionEffect synthesis (legacy table).
        }

        // release guard after this task queue tick
        setTimeout(() => { try { if (this?.flags?.[MODULE_ID]) this.flags[MODULE_ID]._movedThisPrepare = false; } catch {} }, 0);
        return out;
      },
      "WRAPPER"
    );
  });

  // ⬇️ Post-load normalization so actors immediately use the forced model after reload
  Hooks.once("ready", async () => {
    console.log(
      `[${MODULE_ID}] ready | rulesVersion=${rulesVersion()} | swapOn=${swapOn()} | force2024=${force2024()} | force2014=${force2014()} | hasAddExh=${hasAddExhaustion()}`
    );

    // Re-apply the popover text after everything’s live and refresh VAE panel
    _applyExhaustionUIText();

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    try {
      /* ---------- LEGACY CORE → 2024 (your existing working path) ---------- */
      if (swapOn() && force2024() && coreIsLegacy()) {
        // 1) Strip any saved legacy Exhaustion AE payload (changes[])
        for (const a of game.actors ?? []) {
          for (const eff of a.effects ?? []) {
            const e = eff?.toObject?.() ?? eff;
            const isExh =
              e?.flags?.core?.statusId === "exhaustion" ||
              e?.flags?.dnd5e?.conditionId === "exhaustion" ||
              e?.flags?.dnd5e?.conditionType === "exhaustion" ||
              String(e?.name ?? "").toLowerCase().includes("exhaust");
            if (!isExh) continue;
            if (Array.isArray(eff.changes) && eff.changes.length) {
              try { await eff.update({ changes: [] }); } catch {}
            }
          }
        }
        await sleep(10);
        for (const a of game.actors ?? []) {
          const lvl = exLevel(a);
          if (!lvl) continue;
          try { await a.update({ "system.attributes.exhaustion": lvl }, { diff: false }); } catch {}
        }
        for (const a of game.actors ?? []) { try { a.prepareData?.(); a.render?.(false); } catch {} }
      }

      /* ---------- MODERN CORE → 2014 (mirror path) ---------- */
      if (swapOn() && force2014() && coreIsModern()) {
        // Ensure modern reductions are disabled
        applyModernReductionShim();

        // Nudge actors so 2014 synthesis applies immediately after reload
        for (const a of game.actors ?? []) {
          const lvl = exLevel(a);
          if (!lvl) continue;
          try {
            await a.update({ "system.attributes.exhaustion": lvl }, { diff: false, render: false });
          } catch {}
        }
        // Do NOT call a.prepareData()/render here — avoids double-halving/zeroing.
      }
    } catch (err) {
      console.error(`${MODULE_ID} | post-load normalization failed`, err);
    }
  });

  // Optional: if you fire this when toggling the setting, the UI text will update instantly.
  Hooks.on("cexhaustion-reapply", () => {
    try { _applyExhaustionUIText(); } catch (e) { console.error(`[${MODULE_ID}] tooltip swap failed (reapply)`, e); }

  });
}
