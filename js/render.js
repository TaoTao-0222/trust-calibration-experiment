// render.js — 建议文本渲染（text_templates.py 的 JS 移植，模板表由 build_stimuli 编译）
// 特征组合 (x1 充实度, x2 自信度)；概率一律整数百分比；引述只转述已展示指标。

(function (global) {
"use strict";
const T = (typeof TEMPLATE_VERSION !== "undefined")
  ? { TEMPLATE_VERSION, CONCLUSION_ONLY, OPENERS, CONCLUSIONS, CITE_PHRASES,
      CONFIDENT_MARKERS, HEDGE_MARKERS, BANNED_TOKENS }
  : require("../stimuli/templates.js");

const CITE_KEYS = ["debt", "cash", "boom", "history"];

function fmtPct(p) { return Math.round(100 * p) + "%"; }

// 指标分档（与 text_templates._band_of 同阈值）
function bandOf(key, value) {
  if (key === "debt") return value < 40 ? "偏低" : (value < 65 ? "中等" : "偏高");
  if (key === "cash") return value < 0.8 ? "偏低" : (value < 1.6 ? "中等" : "偏高");
  if (key === "boom") return value < 45 ? "偏低" : (value < 65 ? "中等" : "偏高");
  if (key === "history") return value === 0 ? "无" : (value <= 2 ? "少" : "多");
  throw new Error("未知指标 " + key);
}

function citeIndicator(key, indicators, style) {
  const d = indicators[key];
  const phrase = T.CITE_PHRASES[key][bandOf(key, d.value)][style];
  return phrase.replace("{disp}", d.display).replace("{n}", String(d.value));
}

// 主渲染入口：prob (0–1)、indicators（案例四指标）、combo [x1, x2]
function renderAdvice(prob, indicators, combo, rng) {
  const x1 = combo[0], x2 = combo[1];
  const style = x2 ? "confident" : "hedge";
  const p = fmtPct(prob);
  if (!x1) {                                       // 低充实：单句结论
    const pool = T.CONCLUSION_ONLY[style];
    return pool[rng.int(pool.length)].replace("{p}", p) + "。";
  }
  const opener = T.OPENERS[rng.int(T.OPENERS.length)];
  const nCite = 1 + rng.int(2);                    // 1–2 个引述
  const keys = rng.sample(CITE_KEYS, nCite);
  const cites = keys.map(k => citeIndicator(k, indicators, style));
  const conclPool = T.CONCLUSIONS[style];
  const concl = conclPool[rng.int(conclPool.length)];
  return [opener, ...cites].join("，") + "。" + concl.replace("{p}", p) + "。";
}

// ---- 文本自检（validate_materials 规则移植，供无头测试）
const CITE_SIGNATURE = { debt: "资产负债率", cash: "现金短债比", boom: "景气指数", history: "违约记录" };

function checkText(t, combo) {
  const problems = [];
  const x1 = combo[0], x2 = combo[1];
  for (const tok of T.BANNED_TOKENS) if (t.includes(tok)) problems.push(`禁词 ${tok}`);
  const mine = x2 ? T.CONFIDENT_MARKERS : T.HEDGE_MARKERS;
  const other = x2 ? T.HEDGE_MARKERS : T.CONFIDENT_MARKERS;
  if (!mine.some(m => t.includes(m))) problems.push("缺本方风格标记");
  for (const m of other) if (t.includes(m)) problems.push(`混入对方标记 ${m}`);
  for (const num of t.match(/(\d+(?:\.\d+)?)%/g) || []) {
    if (num.slice(0, -1).includes(".")) problems.push(`非整数百分比 ${num}`);
  }
  const nCite = Object.values(CITE_SIGNATURE).reduce((s, sig) => s + (t.includes(sig) ? 1 : 0), 0);
  if (!x1 && nCite !== 0) problems.push("低充实出现引述");
  if (x1 && (nCite < 1 || nCite > 2)) problems.push(`高充实引述数 ${nCite}`);
  return problems;
}

const api = { fmtPct, bandOf, citeIndicator, renderAdvice, checkText };
if (typeof module !== "undefined") module.exports = api;
else Object.assign(global, api);
})(typeof window !== "undefined" ? window : globalThis);
