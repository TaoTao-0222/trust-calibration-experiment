// experiment.js — 实验总编排（对应设计文档 §4/§9）
// URL 参数：id（被试 ID，缺省则随机）、arm（conflict|control，缺省按 id 哈希各半）、
//           redirect（完成回跳地址）、simulate=1（data-only 仿真自检）、autopilot=1（试次屏自动作答）。

"use strict";

const CONFIG = {
  datapipe_experiment_id: "jMD0X5Z3ZbtE",  // DataPipe 实验 ID（README 步骤 2 填入；空则跳过 DataPipe）
  save_url: "",                      // 自建保存端点（POST JSON；空则用下载兜底）
  completion_salt: "trust-calib-2026",
  n_practice: 3,
  probe_rate: 0.20,                  // P2 稀疏探针比例（§4.5）
  break_seconds: 30,
};

const ADV_NAMES = ["Alpha", "Beta", "Gamma"];
const ADV_COLORS = { Alpha: "#3a7bd5", Beta: "#2fa36b", Gamma: "#e08a2e" };
// 名称—能力映射的拉丁轮转（被试间平衡）
const ADV_MAPS = [
  { H: "Alpha", M: "Beta", L: "Gamma" },
  { H: "Beta", M: "Gamma", L: "Alpha" },
  { H: "Gamma", M: "Alpha", L: "Beta" },
];

const url = new URLSearchParams(location.search);
const PID = url.get("id") || ("anon-" + Math.random().toString(36).slice(2, 10));
const ARM = url.get("arm") ||
  (hashSeed(PID + "|arm") % 2 === 0 ? "conflict" : "control");
const SIMULATE = url.get("simulate") === "1";
const AUTOPILOT = url.get("autopilot") === "1";
if (url.get("save")) CONFIG.save_url = url.get("save");   // 测试/自建端点覆盖
const SID = PID;                                            // DataPipe sessionID

const SESSION = { trials: [], probes: [], saves: [], t0: Date.now() };

// ---------------------------------------------------------------- 工具
function advisorObjs(trialRow) {
  // 该行在场顾问的显示对象数组（名称/颜色/能力键）
  const map = ADV_MAPS[hashSeed(PID + "|map") % ADV_MAPS.length];
  return trialRow.advisors.map(k => ({ key: k, name: map[k], color: ADV_COLORS[map[k]] }));
}

function completionCode() {
  return (hashSeed(SID + "|" + CONFIG.completion_salt) >>> 0).toString(36).toUpperCase()
    .padStart(7, "0").slice(0, 7);
}

async function saveChunk(part) {
  const payload = {
    session: SID, arm: ARM, part,
    when: new Date().toISOString(),
    elapsed_min: (Date.now() - SESSION.t0) / 60000,
    trials: SESSION.trials,
    responses: jsPsych.data.get().json(),
  };
  SESSION.saves.push({ part, at: payload.when });
  const body = JSON.stringify(payload);
  // 1) 自建端点优先
  if (CONFIG.save_url) {
    try {
      await fetch(CONFIG.save_url, { method: "POST",
        headers: { "Content-Type": "application/json" }, body });
      return;
    } catch (e) { console.warn("save_url 失败，尝试 DataPipe", e); }
  }
  // 2) DataPipe
  if (CONFIG.datapipe_experiment_id) {
    try {
      await fetch("https://pipe.jspsych.org/api/data", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentID: CONFIG.datapipe_experiment_id,
          sessionID: SID,
          filename: `${SID}-${part}.json`,
          data: body,
        }),
      });
      return;
    } catch (e) { console.warn("DataPipe 失败", e); }
  }
  // 3) 完成时的下载兜底（中途失败仅记录）
  if (part === "final") {
    const blob = new Blob([body], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${SID}-final.json`;
    a.click();
  }
}

// ---------------------------------------------------------------- 试次装配
function buildTrialNodes(row, c, rng, advisorMap) {
  const y = genOutcome(c.p, rng);
  const a = genAdvice(c.p, row, rng);
  const advs = advisorObjs(row).map(o => {
    const combo = row.pure_number ? null : (row.combos[o.key] || null);
    return {
      ...o,
      prob: a[o.key],
      combo,
      pure_number: row.pure_number,
      text: combo ? renderAdvice(a[o.key], c.indicators, combo, rng) : null,
      score: scoreOf(a[o.key], y),
    };
  });
  const nodes = [];
  nodes.push({
    type: JasJudgePlugin, stage: "initial", case_data: c, autopilot: AUTOPILOT,
    data: { record_type: "trial", trial: row.trial, part: "initial", phase: row.phase },
  });
  nodes.push({
    type: JasJudgePlugin, stage: "final", case_data: c, advisors: advs,
    autopilot: AUTOPILOT,
    data: { record_type: "trial", trial: row.trial, part: "final", phase: row.phase },
  });
  nodes.push({
    type: FeedbackPlugin, case_data: c, outcome: y,
    advisors: advs.map(o => ({ name: o.name, color: o.color, prob: o.prob, score: o.score })),
    // 自身得分在 on_start 由前两屏数据计算（I/F 尚不存在于装配时）
    self_scores: { I: "–", F: "–", I_val: "–", F_val: "–" },
    autopilot: AUTOPILOT,
    data: { record_type: "trial", trial: row.trial, part: "feedback", phase: row.phase },
    on_start: function (trial) {
      const dat = jsPsych.data.get().filter({ trial: row.trial }).values();
      const I = dat.find(d => d.I !== undefined), F = dat.find(d => d.F !== undefined);
      trial.self_scores = {
        I: I ? Math.round(100 * (1 - Math.pow(I.I / 100 - y, 2))) : "–",
        F: F ? Math.round(100 * (1 - Math.pow(F.F / 100 - y, 2))) : "–",
        I_val: I ? I.I : "–", F_val: F ? F.F : "–",
      };
    },
    on_finish: function () {
      if (row.phase === "PRACTICE") return;        // 练习不入正式记录
      const dat = jsPsych.data.get().filter({ trial: row.trial }).values();
      const I = dat.find(d => d.I !== undefined), F = dat.find(d => d.F !== undefined);
      SESSION.trials.push({
        trial: row.trial, phase: row.phase, arm: ARM,
        case_idx: c._idx, industry: c.industry, company: c.company,
        p: c.p, difficulty: c.difficulty, y,
        divergence: row.divergence, pure_number: row.pure_number, minority: row.minority,
        present: row.advisors,
        combos: row.pure_number ? null : row.combos,
        advice: Object.fromEntries(advs.map(o => [o.key, {
          name: o.name, a: o.prob, text: o.text, combo: o.combo, score: o.score }])),
        d_tilde: dtilde({ H: a.H, M: a.M, L: a.L }),
        I: I ? I.I : null, I_conf: I ? I.I_conf : null, rt_I: I ? I.rt : null,
        F: F ? F.F : null, rt_F: F ? F.rt : null,
        advisor_map: ADV_MAPS[hashSeed(PID + "|map") % ADV_MAPS.length],
      });
    },
  });
  // P2 稀疏探针（随机选一名在场顾问）
  if (row.phase === "P2" && rng.bernoulli(CONFIG.probe_rate)) {
    const pick = advs[rng.int(advs.length)];
    nodes.push({
      type: ProbePlugin, advisor: pick, autopilot: AUTOPILOT,
      data: { record_type: "probe", trial: row.trial, advisor: pick.key },
      on_finish: function (d) {
        SESSION.probes.push({ trial: row.trial, advisor: pick.key,
          rich: d.rich, conf: d.conf, rt: d.rt });
      },
    });
  }
  return nodes;
}

function breakNode(label) {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="break-card"><h2>稍作休息</h2>
      <p>${label}——休息 ${CONFIG.break_seconds} 秒后可继续。</p></div>`,
    choices: ["继续实验"],
    trial_duration: SIMULATE ? 50 : (CONFIG.break_seconds + 2) * 1000,
    data: { record_type: "break" },
    // 强制休息：按钮在倒计时结束后才可用
    on_load: function () {
      const btn = document.querySelector(".jspsych-btn");
      if (btn && !SIMULATE) {
        btn.disabled = true;
        let left = CONFIG.break_seconds;
        const tick = setInterval(() => {
          left -= 1;
          if (left <= 0) { clearInterval(tick); btn.disabled = false;
            btn.textContent = "继续实验"; }
          else btn.textContent = `继续实验（${left}s）`;
        }, 1000);
        btn.textContent = `继续实验（${CONFIG.break_seconds}s）`;
      }
    },
  };
}

// ---------------------------------------------------------------- 指导语文本
function instructionPages() {
  const map = ADV_MAPS[hashSeed(PID + "|map") % ADV_MAPS.length];
  const chips = ADV_NAMES.map(n =>
    `<span class="adv-badge" style="background:${ADV_COLORS[n]}">${n}</span>`).join(" ");
  return [
    `<div class="inst"><h2>背景</h2>
     <p>关税冲突与供应链重构之下，银行需要重新评估外贸企业的违约风险。
     您是银行风控委员会委员，正在评估三套拟采购的智能风控系统——
     ${chips}——的回测表现。</p>
     <p>每局给出一家外贸企业的材料（企业小传 + 四项量化指标），
     请您估计该企业一年内发生债务违约的概率（0–100%）。</p></div>`,
    `<div class="inst"><h2>作答流程（两阶段）</h2>
     <p>每一局，您将：<b>①</b> 先独立给出自己的初步估计与信心；
     <b>②</b> 查看在场系统的估计（概率 + 说明文字，或仅数值）；
     <b>③</b> 给出最终估计；<b>④</b> 查看真值结果与各系统、您本人的本局得分。</p>
     <p>三套系统有时单独出场，有时同时出场。它们的实际表现可能不同，
     请您在回测中自行体会。</p></div>`,
    `<div class="inst"><h2>得分与报酬</h2>
     <p>每局得分 = 100 ×（1 − 误差²），误差为估计概率与真实结果（0 或 1）之差。
     例如估计 70% 而企业未违约，本局得分 = 100 × (1 − 0.49) = 51 分。</p>
     <p><b>报酬 = 基础报酬 10 元 + 绩效奖金（最高 10 元）</b>。绩效奖金按随机抽局制：
     实验结束后，程序随机抽取 10 局，每局等概率抽取您的初判或终判得分，
     绩效奖金 = 抽中分数的均值 / 100 × 10 元。每一局的每次作答都可能被抽中，请认真作答。</p>
     <p>系统得分仅用于您的评估参考，不影响您的报酬。</p></div>`,
    `<div class="inst"><h2>接下来</h2>
     <p>先完成 ${CONFIG.n_practice} 局练习熟悉流程（练习不计成绩），随后进入正式回测，
     全程约 45 分钟。请使用电脑作答，中途不要刷新页面。</p>
     <p>点击"开始"进入练习。</p></div>`,
  ];
}

function comprehensionCheck() {
  return {
    type: jsPsychSurveyMultiChoice,
    preamble: "<h3>开始前请确认您已理解规则</h3>",
    questions: [
      { prompt: "您的绩效奖金如何计算？",
        options: ["全部作答的平均分", "随机抽 10 局、每局随机抽初判或终判得分的均值",
                  "最后 10 局的得分均值"],
        required: true },
      { prompt: "三套智能系统的关系是？",
        options: ["它们是同一系统的三个版本", "三套拟采购的不同系统，表现可能不同",
                  "其中一套一定总是正确的"],
        required: true },
      { prompt: "作答流程的顺序是？",
        options: ["看系统建议 → 初判 → 终判", "初判 → 看系统建议 → 终判 → 反馈",
                  "直接给出一次估计"],
        required: true },
    ],
    data: { record_type: "comprehension" },
  };
}

function attentionCheck2() {
  // 锚点与 questionnaires.js 的 LIKERT7 保持一致（“比较同意”= 第 5 档，原始记录值 4）。
  // 2026-08-02 先导（n=62）发现旧锚点（“6 比较同意”）致 0/62 通过——被试按全套量表的
  // “比较同意=第 5 档”习惯作答被误杀，故对齐；该批数据 AC2 不作剔除依据。
  return {
    type: jsPsychSurveyLikert,
    preamble: "<h3>中途确认</h3>",
    questions: [{ prompt: "为确认您在认真阅读，本题请选择「比较同意」。",
      labels: ["1 很不同意", "2 不同意", "3 有点不同意", "4 中立",
               "5 比较同意", "6 同意", "7 很同意"], required: true }],
    data: { record_type: "attention_check", ac_id: 2 },
    scale_width: 700,
  };
}

// ---------------------------------------------------------------- 主流程
function buildTimeline(jsPsych) {
  const rng = new RNG(hashSeed(PID + "|" + ARM));
  const rows = buildSchedule(ARM, rng);
  const caseIdx = rng.sample(CASE_POOL.map((_, i) => i), CASE_POOL.length);
  const trialCase = rows.map((_, t) => caseIdx[t]);
  const advisorMap = ADV_MAPS[hashSeed(PID + "|map") % ADV_MAPS.length];
  const advisorObjsAll = ADV_NAMES.map(n => ({ name: n, color: ADV_COLORS[n] }));

  const tl = [];
  // 宽度拦截
  if (window.innerWidth < 1100 && !SIMULATE) {
    tl.push({ type: jsPsychHtmlButtonResponse, choices: ["刷新重试"],
      stimulus: "<h2>请使用电脑浏览器并将窗口加宽（≥1100px）后再开始。</h2>",
      data: { record_type: "blocked" } });
    return tl;
  }
  // 知情同意
  tl.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="inst"><h2>知情同意</h2>
      <p>本研究为外贸企业信用风险评估决策实验，全程约 45 分钟。
      您的作答数据将匿名保存并仅用于学术研究；您可以随时关闭页面退出，
      退出不影响已获得的基础报酬（以平台规则为准）。</p>
      <p>点击"同意并开始"即表示您知情同意。</p></div>`,
    choices: ["同意并开始"],
    data: { record_type: "consent" },
  });
  // 指导语 + 理解检查 + 前测
  tl.push({ type: jsPsychInstructions, pages: instructionPages(),
    show_clickable_nav: true, data: { record_type: "instructions" } });
  tl.push(comprehensionCheck());
  if (typeof Questionnaires !== "undefined") tl.push(...Questionnaires.buildPreTask());
  // 练习
  for (let i = 0; i < CONFIG.n_practice; i++) {
    const c = { ...CASE_POOL[caseIdx[250 + i]], _idx: caseIdx[250 + i] };
    const row = { trial: -1 - i, phase: "PRACTICE", advisors: [ADV_NAMES_KEYS(i)],
                  divergence: "none", pure_number: false,
                  combos: { [ADV_NAMES_KEYS(i)]: [1, 1] }, arm: ARM };
    tl.push(...buildTrialNodes(row, c, rng, advisorMap));
  }
  // 正式试次（分段休息 + 量表点）
  const segDefs = [
    { phase: "P1", end: 90, scale: 1 },
    { phase: "P2", end: 190, scale: 2 },
    { phase: "P3", end: 250, scale: 3 },
  ];
  let segStart = 0;
  for (const seg of segDefs) {
    const segRows = rows.slice(segStart, seg.end);
    for (let i = 0; i < segRows.length; i++) {
      if (i > 0 && i % 50 === 0) tl.push(breakNode(`已完成 ${segStart + i} / 250 局`));
      const c = { ...CASE_POOL[trialCase[segStart + i]], _idx: trialCase[segStart + i] };
      tl.push(...buildTrialNodes(segRows[i], c, rng, advisorMap));
      if (seg.phase === "P2" && i === 49) tl.push(attentionCheck2());
    }
    tl.push(...Questionnaires.buildScalePoint(seg.scale,
      ADV_NAMES.map(n => ({ name: n, color: ADV_COLORS[n] }))));
    tl.push({ type: jsPsychCallFunction, func: () => saveChunk("P" + seg.scale),
      data: { record_type: "save", part: "P" + seg.scale } });
    segStart = seg.end;
  }
  // 后测 → 完成页 → 最终保存（保存捕获完成码记录）
  tl.push(...Questionnaires.buildPostTask(ARM));
  const redir = url.get("redirect");
  tl.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: () => `<div class="inst"><h2>实验完成，感谢您的参与！</h2>
      <p>您的完成码：<b class="code">${completionCode()}</b>（请复制保存）</p>
      ${redir ? `<p><a class="jspsych-btn" href="${redir}">点击返回平台领取报酬</a></p>`
              : "<p>请按平台指引发送完成码。</p>"}</div>`,
    choices: ["结束"],
    data: { record_type: "completion", code: completionCode() },
  });
  tl.push({ type: jsPsychCallFunction, func: () => saveChunk("final"),
    data: { record_type: "save", part: "final" } });
  return tl;
}

// 练习轮用的顾问键轮换（H/M/L 各一次）
function ADV_NAMES_KEYS(i) { return ["H", "M", "L"][i % 3]; }

// ---------------------------------------------------------------- 启动
window.addEventListener("load", () => {
  const jsPsych = initJsPsych({
    display_element: "jspsych-target",
    show_progress_bar: true,
    message_progress_bar: "完成进度",
  });
  window.jsPsych = jsPsych;          // 供 saveChunk / on_start 等顶层函数引用
  const tl = buildTimeline(jsPsych);
  if (SIMULATE) {
    jsPsych.simulate(tl, "data-only", {}).then(() => {
      // 时间线内的 save 节点已完成保存（含 final），此处只提示
      document.getElementById("jspsych-target").innerHTML =
        "<h2>仿真完成，数据已保存。</h2>";
    });
  } else {
    jsPsych.run(tl);
  }
});
