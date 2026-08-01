// headless_test.js — 无头冒烟：JS 移植与 Python 侧的边际对等验证
// 运行：node test/headless_test.js
// 通过标准见方案"验证"节：排程平衡校验全过、顾问边际得分命中目标、
// 多数位命中率 ≈65%、文本规则零违规、案例无重复。

"use strict";
const { RNG } = require("../js/rng.js");
const { buildSchedule, validateSchedule } = require("../js/schedule.js");
const { genOutcome, genAdvice, scoreOf } = require("../js/advice.js");
const { renderAdvice, checkText } = require("../js/render.js");
const { CASE_POOL } = require("../stimuli/case_pool.js");
const { PARAMS } = require("../stimuli/params.js");

let failures = 0;
function expect(name, cond, detail) {
  const mark = cond ? "✓" : "✗";
  if (!cond) failures += 1;
  console.log(`  ${mark} ${name}${detail ? "  [" + detail + "]" : ""}`);
}

// ---- 1. 排程校验（两臂 × 20 seed 全过）
console.log("== 排程平衡校验 ==");
let allPass = true;
for (const arm of ["conflict", "control"]) {
  for (let s = 0; s < 20; s++) {
    const rows = buildSchedule(arm, new RNG(1000 + s));
    const rep = validateSchedule(rows, arm);
    if (!rep["汇总"][0]) {
      allPass = false;
      console.log(`  失败 ${arm} seed=${s}:`,
        Object.entries(rep).filter(([k, v]) => !v[0]).map(([k, v]) => `${k}=${v[1]}`));
    }
  }
}
expect("两臂 × 20 排程全部通过", allPass);

// ---- 2. 边际得分与多数位命中率（1000 模拟被试 / 臂）
console.log("== 边际得分与多数位命中率（1000/臂）==");
for (const arm of ["conflict", "control"]) {
  const rng = new RNG(42);
  const sum = { H: 0, M: 0, L: 0 }, cnt = { H: 0, M: 0, L: 0 };
  let majN = 0, majHit = 0;
  for (let subj = 0; subj < 1000; subj++) {
    const rows = buildSchedule(arm, rng);
    const caseIdx = rng.sample(CASE_POOL.map((_, i) => i), rows.length);
    for (let t = 0; t < rows.length; t++) {
      const row = rows[t], c = CASE_POOL[caseIdx[t]];
      const y = genOutcome(c.p, rng);
      const a = genAdvice(c.p, row, rng);
      for (const k of PARAMS.advisors) {
        const s = scoreOf(a[k], y);
        if (s !== null) { sum[k] += s; cnt[k] += 1; }
      }
      if (row.divergence === "split") {
        const mi = row.minority;
        const others = PARAMS.advisors.filter(k => k !== mi);
        const dMaj = Math.min(...others.map(k => Math.abs(a[k] - c.p)));
        const dMin = Math.abs(a[mi] - c.p);
        majN += 1; if (dMaj < dMin) majHit += 1;
      }
    }
  }
  for (const k of PARAMS.advisors) {
    const mean = sum[k] / cnt[k], tgt = PARAMS.target_scores[k];
    expect(`${arm} 顾问 ${k} 边际得分 ≈${tgt}`, Math.abs(mean - tgt) <= 2.0,
      `实际 ${mean.toFixed(2)}`);
  }
  if (arm === "conflict") {
    // 实测"多数对更近真值"率：生成机制下 σ 差异与 min(二取一) 使其系统高于 u 抽取率 0.65，
    // Python 侧同指标实测 0.678（simulate.py gen_advice，n=10500）——以对等值为准
    expect("2v1 多数位实测更近率 ≈0.678（与 Python 对等）",
      Math.abs(majHit / majN - 0.678) < 0.02,
      `实际 ${(majHit / majN).toFixed(3)}`);
  }
}

// ---- 3. 两臂得分差 ≤2
console.log("== 臂间配平 ==");
{
  const arms = ["conflict", "control"].map(arm => {
    const rng = new RNG(7);
    const sum = { H: 0, M: 0, L: 0 }, cnt = { H: 0, M: 0, L: 0 };
    for (let subj = 0; subj < 300; subj++) {
      const rows = buildSchedule(arm, rng);
      const caseIdx = rng.sample(CASE_POOL.map((_, i) => i), rows.length);
      for (let t = 0; t < rows.length; t++) {
        const y = genOutcome(CASE_POOL[caseIdx[t]].p, rng);
        const a = genAdvice(CASE_POOL[caseIdx[t]].p, rows[t], rng);
        for (const k of PARAMS.advisors) {
          const s = scoreOf(a[k], y);
          if (s !== null) { sum[k] += s; cnt[k] += 1; }
        }
      }
    }
    return Object.fromEntries(PARAMS.advisors.map(k => [k, sum[k] / cnt[k]]));
  });
  for (const k of PARAMS.advisors) {
    const diff = Math.abs(arms[0][k] - arms[1][k]);
    expect(`臂间 ${k} 差 ≤2`, diff <= 2.0,
      `conflict=${arms[0][k].toFixed(2)} control=${arms[1][k].toFixed(2)} diff=${diff.toFixed(2)}`);
  }
}

// ---- 4. 文本规则（200 案例 × 4 组合）
console.log("== 文本规则 ==");
{
  const rng = new RNG(99);
  let probs = [];
  for (let i = 0; i < 200; i++) {
    const c = CASE_POOL[rng.int(CASE_POOL.length)];
    for (const combo of PARAMS.feature_combos) {
      const t = renderAdvice(c.p, c.indicators, combo, rng);
      probs.push(...checkText(t, combo).map(e => `${combo}: ${e} @ ${t}`));
    }
  }
  expect("800 渲染零违规", probs.length === 0, probs.slice(0, 3).join(" | "));
}

// ---- 5. 案例无放回（250/270 不重复）
console.log("== 案例抽取 ==");
{
  const rng = new RNG(5);
  const idx = rng.sample(CASE_POOL.map((_, i) => i), 250);
  expect("250 试次案例无重复", new Set(idx).size === 250);
}

console.log(failures === 0 ? "\n全部通过 ✅" : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
