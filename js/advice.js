// advice.js — 三顾问建议生成（simulate.py gen_advice 的 JS 移植，逐式对照）
// 输入案例真值 p 与排程行，输出各顾问建议 a_k（缺席为 null）与真值结果 y。
// 各顾问 × 各脚本的边际得分由 σ 标定表保证（与模拟管线同表）。

(function (global) {
"use strict";
const P = (typeof PARAMS !== "undefined") ? PARAMS : require("../stimuli/params.js").PARAMS;
const ADVISORS = P.advisors;
const CLIP = P.clip;
const SQ = Math.sqrt(1 - P.rho_low * P.rho_low);

function clip(v) { return Math.min(Math.max(v, CLIP[0]), CLIP[1]); }

// 真值结果：y ~ Bernoulli(p)
function genOutcome(p, rng) { return rng.bernoulli(p) ? 1 : 0; }

// 单条试次的建议生成。row：buildSchedule 行；返回 {H: a|null, M: ..., L: ...}
function genAdvice(p, row, rng) {
  const a = { H: null, M: null, L: null };
  const present = row.advisors;
  if (present.length === 1) {                        // 单顾问试次
    const k = present[0];
    a[k] = clip(p + P.sigmas[k].single * rng.normal());
    return a;
  }
  // 联合试次（冲突臂 P2）：按发散脚本
  if (row.divergence === "low") {
    const c = rng.normal();
    for (const k of present) {
      a[k] = clip(p + P.sigmas[k].low * (P.rho_low * c + SQ * rng.normal()));
    }
  } else if (row.divergence === "split") {
    const mi = row.minority;
    const u = rng.bernoulli(P.maj_hit);              // true → 多数对近、少数位远
    const zMajor = rng.normal();
    const zMinor = -Math.sign(zMajor) * Math.abs(rng.normal());
    for (const k of present) {
      const close = (k === mi) ? !u : u;             // 该顾问是否取近端系数
      const fac = close ? P.q_close : P.r_far;
      const z = (k === mi) ? zMinor : zMajor;
      a[k] = clip(p + P.sigmas[k].split * fac * z);
    }
  } else if (row.divergence === "high") {
    for (const k of present) {
      a[k] = clip(p + P.sigmas[k].high * rng.normal());
    }
  } else {
    throw new Error("联合试次缺少发散类型: " + row.divergence);
  }
  return a;
}

// 顾问得分（100·(1−Brier)）
function scoreOf(a, y) { return a === null ? null : Math.round(100 * (1 - (a - y) * (a - y))); }

// D̃ = 三建议 SD / D_SCALE（联合试次；数据记录用，不展示给被试）
function dtilde(a) {
  const vals = ADVISORS.map(k => a[k]).filter(v => v !== null);
  if (vals.length < 3) return 0;
  const m = (vals[0] + vals[1] + vals[2]) / 3;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) * (v - m), 0) / (vals.length - 1));
  return sd / P.d_scale;
}

const api = { genOutcome, genAdvice, scoreOf, dtilde };
if (typeof module !== "undefined") module.exports = api;
else Object.assign(global, api);
})(typeof window !== "undefined" ? window : globalThis);
