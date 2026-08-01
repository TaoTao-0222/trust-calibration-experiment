// schedule.js — 250 试次排程生成（design.py 的 JS 移植，逐函数对照）
// 约束随机化 + 平衡校验（校验不过自动重抽，与 Python 同语义）。

(function (global) {
"use strict";
const P = (typeof PARAMS !== "undefined") ? PARAMS : require("../stimuli/params.js").PARAMS;
const ADVISORS = P.advisors;                       // ["H","M","L"]
const FEATURE_COMBOS = P.feature_combos;           // [[0,0],[0,1],[1,0],[1,1]]
const DIVERGENCE_TYPES = ["low", "split", "high"];

// ---- 基础构造
function rotationCounts(counts, rng) {             // counts: [[key, n], ...]
  const seq = [];
  for (const [k, n] of counts) for (let i = 0; i < n; i++) seq.push(k);
  return rng.shuffle(seq);
}

function pureNumberFlags(counts, frac, rng) {      // → {key: bool[]}
  const flags = {};
  for (const [key, n] of counts) {
    const nPn = Math.round(n * frac);
    const f = new Array(n).fill(false);
    for (let i = 0; i < nPn; i++) f[i] = true;
    flags[key] = rng.shuffle(f);
  }
  return flags;
}

// 2v1 少数位归属（三顾问平衡）
function majorityAssignments(nSplit, rng) {
  const base = Math.floor(nSplit / 3), rem = nSplit - 3 * base;
  const seq = [];
  for (const a of ADVISORS) for (let i = 0; i < base; i++) seq.push(a);
  if (rem) seq.push(...rng.sample(ADVISORS, rem));
  return rng.shuffle(seq);
}

// ---- 特征分配（约束随机化）
function assignFeaturesP2(divSeq, pnFlags, rng) {
  const textIdxByDiv = { low: [], split: [], high: [] };
  const counters = { low: 0, split: 0, high: 0 };
  for (let i = 0; i < divSeq.length; i++) {
    const d = divSeq[i], j = counters[d]++;
    if (!pnFlags[d][j]) textIdxByDiv[d].push(i);
  }
  const nText = DIVERGENCE_TYPES.reduce((s, d) => s + textIdxByDiv[d].length, 0);
  if (nText === 0) return null;

  const base = Math.floor(nText / FEATURE_COMBOS.length), rem = nText % FEATURE_COMBOS.length;
  const perAdvisor = {};
  for (const a of ADVISORS) {
    const bag = [];
    for (let i = 0; i < base; i++) for (const c of FEATURE_COMBOS) bag.push(c);
    for (const j of rng.sample(FEATURE_COMBOS.map((_, i) => i), rem)) bag.push(FEATURE_COMBOS[j]);
    perAdvisor[a] = rng.shuffle(bag);
  }
  const combos = divSeq.map(() => ({}));
  let pos = 0;
  for (const d of DIVERGENCE_TYPES) {
    for (const i of textIdxByDiv[d]) {
      for (const a of ADVISORS) combos[i][a] = perAdvisor[a][pos];
      pos += 1;
    }
  }
  if (!checkJoint(combos, textIdxByDiv)) return null;
  return combos;
}

function checkJoint(combos, textIdxByDiv) {
  // 1) 顾问 × 组合 × 发散单元格
  for (const d of DIVERGENCE_TYPES) {
    const [lo, hi] = P.tol_cell[d];
    for (const a of ADVISORS) {
      for (const c of FEATURE_COMBOS) {
        const n = textIdxByDiv[d].filter(i =>
          combos[i][a][0] === c[0] && combos[i][a][1] === c[1]).length;
        if (n < lo || n > hi) return false;
      }
    }
  }
  // 2) 三顾问同组合试次上限
  const allIdx = DIVERGENCE_TYPES.flatMap(d => textIdxByDiv[d]);
  const nSame = allIdx.filter(i => {
    const h = combos[i].H, m = combos[i].M, l = combos[i].L;
    return h[0] === m[0] && h[1] === m[1] && h[0] === l[0] && h[1] === l[1];
  }).length;
  if (nSame > P.max_same_combo_trials) return false;
  // 3) 试次内高自信文本数 ~ Binomial(3,.5)，±40%+2 容差
  const nText = allIdx.length;
  const counts = [0, 0, 0, 0];
  for (const i of allIdx) counts[ADVISORS.reduce((s, a) => s + combos[i][a][1], 0)] += 1;
  const expected = [1, 3, 3, 1].map(w => nText * w / 8);
  for (let k = 0; k < 4; k++) {
    if (Math.abs(counts[k] - expected[k]) > 0.4 * expected[k] + 2) return false;
  }
  return true;
}

// ---- 整表装配
function buildSchedule(arm, rng) {
  const rows = [];
  // P1：90 单顾问轮换（文本，纯数字不叠加）
  for (const adv of rotationCounts([["H", 30], ["M", 30], ["L", 30]], rng)) {
    rows.push({ phase: "P1", advisors: [adv], divergence: "none",
                pure_number: false, minority: "",
                combos: { [adv]: FEATURE_COMBOS[rng.int(4)] } });
  }
  // P2
  if (arm === "conflict") {
    const counts = Object.entries(P.p2_divergence_counts);
    const divSeq = rotationCounts(counts, rng);
    const pn = pureNumberFlags(counts, P.pure_number_frac, rng);
    const minorities = majorityAssignments(P.p2_divergence_counts.split, rng);
    let combos = null;
    for (let r = 0; r < P.max_resample && combos === null; r++) {
      combos = assignFeaturesP2(divSeq, pn, rng);
    }
    if (combos === null) throw new Error("P2 特征分配超过最大重抽次数");
    let splitI = 0;
    const counters = { low: 0, split: 0, high: 0 };
    for (let i = 0; i < divSeq.length; i++) {
      const d = divSeq[i], j = counters[d]++;
      let minority = "";
      if (d === "split") minority = minorities[splitI++];
      rows.push({ phase: "P2", advisors: ADVISORS.slice(), divergence: d,
                  pure_number: pn[d][j], minority, combos: combos[i] });
    }
  } else {  // control：单顾问轮换，特征同构
    const advSeq = rotationCounts(Object.entries(P.p2_control_counts), rng);
    const pn = new Array(advSeq.length).fill(false);
    for (let i = 0; i < Math.round(advSeq.length * P.pure_number_frac); i++) pn[i] = true;
    rng.shuffle(pn);
    for (let i = 0; i < advSeq.length; i++) {
      rows.push({ phase: "P2", advisors: [advSeq[i]], divergence: "none",
                  pure_number: pn[i], minority: "",
                  combos: pn[i] ? {} : { [advSeq[i]]: FEATURE_COMBOS[rng.int(4)] } });
    }
  }
  // P3：60 单顾问
  for (const adv of rotationCounts([["H", 20], ["M", 20], ["L", 20]], rng)) {
    rows.push({ phase: "P3", advisors: [adv], divergence: "none",
                pure_number: false, minority: "",
                combos: { [adv]: FEATURE_COMBOS[rng.int(4)] } });
  }
  rows.forEach((r, i) => { r.trial = i; r.arm = arm; });
  return rows;
}

// ---- 校验（design.validate_schedule 移植，供无头测试与抽检）
function validateSchedule(rows, arm) {
  const report = {};
  const ok = (name, cond, detail) => { report[name] = [!!cond, detail || ""]; };
  const p2 = rows.filter(r => r.phase === "P2");
  ok("总试次数 = 250", rows.length === 250, `实际 ${rows.length}`);
  ok("P1/P2/P3 = 90/100/60",
     rows.filter(r => r.phase === "P1").length === 90 &&
     p2.length === 100 && rows.filter(r => r.phase === "P3").length === 60);
  if (arm === "conflict") {
    const dc = {};
    for (const r of p2) dc[r.divergence] = (dc[r.divergence] || 0) + 1;
    ok("发散脚本 40/35/25", dc.low === 40 && dc.split === 35 && dc.high === 25,
       JSON.stringify(dc));
    const pnRate = p2.filter(r => r.pure_number).length / p2.length;
    ok("纯数字占比 ≈25%", Math.abs(pnRate - P.pure_number_frac) < 0.02, pnRate.toFixed(3));
    for (const d of DIVERGENCE_TYPES) {
      const sub = p2.filter(r => r.divergence === d);
      const rate = sub.filter(r => r.pure_number).length / sub.length;
      ok(`纯数字×${d} ≈25%`, Math.abs(rate - P.pure_number_frac) < 0.06, rate.toFixed(3));
    }
    const minorities = {};
    for (const r of p2.filter(r => r.divergence === "split")) {
      minorities[r.minority] = (minorities[r.minority] || 0) + 1;
    }
    const [mLo, mHi] = P.tol_minority;
    ok("少数位归属平衡",
       ADVISORS.every(a => (minorities[a] || 0) >= mLo && (minorities[a] || 0) <= mHi),
       JSON.stringify(minorities));
    const text = p2.filter(r => !r.pure_number);
    const [cLo, cHi] = P.tol_advisor_combo;
    const margins = {};
    for (const a of ADVISORS) { margins[a] = FEATURE_COMBOS.map(() => 0); }
    for (const r of text) {
      for (const a of ADVISORS) {
        const ci = FEATURE_COMBOS.findIndex(c =>
          c[0] === r.combos[a][0] && c[1] === r.combos[a][1]);
        margins[a][ci] += 1;
      }
    }
    ok("顾问×组合边际平衡",
       ADVISORS.every(a => margins[a].every(n => n >= cLo && n <= cHi)),
       JSON.stringify(margins));
  } else {
    const ac = {};
    for (const r of p2) ac[r.advisors[0]] = (ac[r.advisors[0]] || 0) + 1;
    ok("对照臂单顾问 34/33/33", ac.H === 34 && ac.M === 33 && ac.L === 33,
       JSON.stringify(ac));
    const pnRate = p2.filter(r => r.pure_number).length / p2.length;
    ok("纯数字占比 ≈25%", Math.abs(pnRate - P.pure_number_frac) < 0.03, pnRate.toFixed(3));
  }
  const nPass = Object.values(report).filter(v => v[0]).length;
  report["汇总"] = [nPass === Object.keys(report).length, `${nPass}/${Object.keys(report).length}`];
  return report;
}

const api = { buildSchedule, validateSchedule, DIVERGENCE_TYPES };
if (typeof module !== "undefined") module.exports = api;
else Object.assign(global, api);
})(typeof window !== "undefined" ? window : globalThis);
