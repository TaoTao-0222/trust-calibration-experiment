// questionnaires.js — 前测 / 量表点 / 后测问卷（jsPsych 8，浏览器 <script> 加载，挂 window.Questionnaires）
//
// 版本：v0.9 候选版。以下量表条目均为候选稿，预注册冻结前须回查原量表逐条核对（表述、
// 维度归属与授权）后定稿：
//   - 信任倾向   Mayer & Davis (1999) propensity to trust，4 题改编（对象扩展至技术系统）；
//   - AI 素养    参照 MAILS（Wang, Rau & Yuan 2023）维度自编 6 题短版；
//   - PFIS       对智能系统的一般信任 4 题（冻结前核对原始出处与条目）；
//   - 计算能力   Lipkus et al. (2001) / Schwartz et al. (1997) numeracy 改编 3 题。
// 各量表条目处以行内注释逐条标注改编来源；numeracy 与注意力检查的正确答案见对应注释。
//
// 计分约定：jsPsych survey-likert 记录所选 label 的下标（0–6），分析阶段统一 +1 得 1–7 分。
// 注意力检查正确档为第 5 档（“比较同意”），对应原始记录值 4（+1 后为 5）。
//
// 暴露接口（均返回 jsPsych 时间线节点数组）：
//   Questionnaires.buildPreTask()                  任务前测量（个体差异 + 注意力检查）
//   Questionnaires.buildScalePoint(point, advisors) 量表点 point ∈ {1,2,3}，advisors = [{name, color}]
//   Questionnaires.buildPostTask(arm)              任务后测量，arm ∈ {"conflict","control"}

(function (global) {
"use strict";

// 7 点李克特锚点：1 = 很不同意 … 7 = 很同意；第 5 档文字为“比较同意”（注意力检查答案锚定此档）。
const LIKERT7 = ["1 很不同意", "2 不同意", "3 有点不同意", "4 中立",
                 "5 比较同意", "6 同意", "7 很同意"];

// 单题李克特（量表题一律 required）
function likertQ(prompt, name) {
  return { prompt, labels: LIKERT7, required: true, name };
}

// 顾问彩色徽标与头部（与 trials.js 的 adv-badge 同款）
function advisorBadge(a) {
  return `<span class="adv-badge" style="background:${a.color}">${a.name}</span>`;
}
function advisorHead(a) {
  return `<div class="adv-head">${advisorBadge(a)}</div>`;
}

// Fisher–Yates 洗牌（返回新数组；用于后测特征顺序随机化，每位被试在构建时间线时执行一次）
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// ================================================================ 任务前测量
function buildPreTask() {

  // ---- 信任倾向（Mayer & Davis 1999 propensity to trust 改编，4 题）
  const propensity = {
    type: jsPsychSurveyLikert,
    preamble: "<p>以下陈述关于您平时与人相处、使用技术系统的一般倾向，请按真实想法作答，没有对错之分。</p>",
    questions: [
      // 改编自原量表 "I generally have faith in humanity" 一类条目（人际对象）
      likertQ("一般而言，我容易信任他人。", "ptt_1"),
      // 改编自原量表 "I feel that people are generally reliable" 一类条目（人际对象）
      likertQ("我通常认为，大多数人是值得信任的。", "ptt_2"),
      // 改编扩展：信任对象由“人”扩展至“技术系统”（冻结前核对是否拆为独立维度计分）
      likertQ("面对不熟悉的技术系统，我倾向于先假定它是可靠的。", "ptt_3"),
      // 改编扩展：同上，对象为新系统
      likertQ("总体而言，我容易信任新的技术系统。", "ptt_4"),
    ],
    randomize_question_order: false,
    button_label: "继续",
    data: { record_type: "pretask", scale: "propensity_to_trust" },
  };

  // ---- AI 素养（参照 MAILS 维度自编 6 题短版）
  const aiLiteracy = {
    type: jsPsychSurveyLikert,
    preamble: "<p>以下陈述关于您对人工智能（AI）系统的了解与使用经验，请按实际情况作答。</p>",
    questions: [
      // 自编，对应 MAILS“理解 AI 输出”维度
      likertQ("我能理解 AI 系统所给出的输出是依据什么产生的。", "ail_1"),
      // 自编，对应 MAILS“AI 知识”维度
      likertQ("我熟悉 AI 系统的基本工作原理。", "ail_2"),
      // 自编，对应 MAILS“批判性评估”维度
      likertQ("我能大致判断 AI 系统的输出在哪些情况下可能出错。", "ail_3"),
      // 自编，对应 MAILS“AI 知识”维度
      likertQ("我了解训练数据的质量会影响 AI 系统的表现。", "ail_4"),
      // 自编，对应 MAILS“AI 使用与评估”维度
      likertQ("在采纳 AI 系统的建议之前，我会先评估它的可靠程度。", "ail_5"),
      // 自编，对应 MAILS“能力边界认知”维度
      likertQ("我清楚 AI 系统能做什么、不能做什么。", "ail_6"),
    ],
    randomize_question_order: false,
    button_label: "继续",
    data: { record_type: "pretask", scale: "ai_literacy" },
  };

  // ---- PFIS：对智能系统的一般信任（4 题；冻结前核对原始出处与条目）
  const pfis = {
    type: jsPsychSurveyLikert,
    preamble: "<p>以下陈述关于您对各类智能系统（如智能推荐、自动评估、预测系统等）的总体看法。</p>",
    questions: [
      // 候选条目 1：功能可靠性信念
      likertQ("我通常相信智能系统能完成其声称的功能。", "pfis_1"),
      // 候选条目 2：输出可信度信念
      likertQ("总体而言，智能系统给出的输出是值得信赖的。", "pfis_2"),
      // 候选条目 3：依赖意愿
      likertQ("在重要事务中，我愿意参考智能系统提供的分析结果。", "pfis_3"),
      // 候选条目 4：适用范围内的可靠性信念
      likertQ("我认为大多数智能系统在其声称的适用范围内是可靠的。", "pfis_4"),
    ],
    randomize_question_order: false,
    button_label: "继续",
    data: { record_type: "pretask", scale: "pfis" },
  };

  // ---- 计算能力 numeracy（Lipkus/Schwartz 改编 3 题，填数字）
  const numeracy = {
    type: jsPsychSurveyText,
    preamble: "<p>以下三道题关于概率的简单计算，请在空格中填入数字（无需写单位或百分号）。</p>",
    questions: [
      // 改编自 Schwartz et al. (1997) “概率频次化”题型。正确答案：300（30% × 1000）
      { prompt: "① 某事件发生的概率为 30%。若相同情形重复 1000 次，该事件大约会发生多少次？",
        placeholder: "请填数字", required: true, name: "num_1" },
      // 改编自 Lipkus et al. (2001) 联合概率题型。正确答案：25（0.5 × 0.5 = 25%）
      { prompt: "② 同时掷两枚质地均匀的硬币，两枚都是正面的概率是多少？（填百分数中的数字，如认为是一半则填 50）",
        placeholder: "请填数字", required: true, name: "num_2" },
      // 改编自 Schwartz et al. (1997) “至少一次”题型。正确答案：19（1 − 0.9² = 19%）
      { prompt: "③ 某事件每次发生的概率为 10%，且各次相互独立。进行两次，至少发生一次的概率约为多少？（填百分数中的数字）",
        placeholder: "请填数字", required: true, name: "num_3" },
    ],
    randomize_question_order: false,
    button_label: "继续",
    data: { record_type: "pretask", scale: "numeracy" },
  };

  // ---- 指导型注意力检查（第 5 档“比较同意”为正确；原始记录值 4，+1 后为 5）
  const attentionCheck = {
    type: jsPsychSurveyLikert,
    questions: [
      likertQ("本题用于检查作答质量，请直接选择“比较同意”，以证明您在认真阅读题目。", "ac_1"),
    ],
    button_label: "继续",
    data: { record_type: "attention_check", ac_id: 1 },
  };

  return [propensity, aiLiteracy, pfis, numeracy, attentionCheck];
}

// ================================================================ 量表点（P1/P2/P3 末）
// point ∈ {1,2,3}；advisors = [{name, color}]（三顾问显示名与徽标颜色）。
// 结构：逐顾问状态信任 3 页（每页 3 题李克特）→ 逐顾问感知校准 3 屏（0–50 滑条）。
function buildScalePoint(point, advisors) {
  if (![1, 2, 3].includes(point)) throw new Error("buildScalePoint: point 须为 1/2/3");
  if (!Array.isArray(advisors) || advisors.length === 0)
    throw new Error("buildScalePoint: advisors 须为 [{name, color}] 数组");

  const tl = [];

  // ---- 状态认知信任（Xu2026 3 题改编，见设计文档 §4.5；冻结前核对原文），每顾问一页
  for (const a of advisors) {
    tl.push({
      type: jsPsychSurveyLikert,
      preamble: advisorHead(a) +
        `<div class="likert-statement">请根据您在刚才这一阶段中的实际体验，针对 ${advisorBadge(a)} 对以下陈述评分（1 = 很不同意，7 = 很同意）。</div>`,
      questions: [
        likertQ("该系统是可靠的。", `trust_rel_${a.name}`),
        likertQ("我相信该系统给出的违约概率估计。", `trust_bel_${a.name}`),
        likertQ("我愿意继续采纳该系统的建议。", `trust_use_${a.name}`),
      ],
      randomize_question_order: false,
      button_label: "继续",
      data: { record_type: "scale", point, scale: "state_trust", advisor: a.name },
    });
  }

  // ---- 感知校准（操纵检验 + 校准直接读数），每顾问一屏，0–50 个百分点
  for (const a of advisors) {
    tl.push({
      type: jsPsychHtmlSliderResponse,
      stimulus: advisorHead(a) +
        `<div class="likert-statement">就刚才这一阶段而言，${advisorBadge(a)} 给出的违约概率估计，平均误差大约是几个百分点？</div>`,
      min: 0,
      max: 50,
      slider_start: 25,
      step: 1,
      labels: ["0 个百分点<br>（完全准确）", "50 个百分点<br>（误差很大）"],
      require_movement: true,
      button_label: "继续",
      data: { record_type: "scale", point, scale: "perceived_calibration", advisor: a.name },
    });
  }

  return tl;
}

// ================================================================ 任务后测量
// arm ∈ {"conflict","control"}；冲突归因在对照臂以假设形式施测（设计文档 §4.5）。
function buildPostTask(arm) {
  if (arm !== "conflict" && arm !== "control")
    throw new Error('buildPostTask: arm 须为 "conflict" 或 "control"');

  const tl = [];

  // ---- 主观线索效度信念（§4.5）：三个锁定特征 × 两问（先任务指称、后一般指称），
  //      特征顺序随机化（本函数内洗牌一次，顺序经 data.feature_order 落盘）。
  //      双极滑条 −100 ~ +100，不设“无法判断”选项；中点 0 的唯一含义 = 与能力无关。
  const FEATURES = [
    { key: "evidence",   desc: "建议所附依据的充实程度（依据充实或单薄）" },
    { key: "confidence", desc: "建议措辞的确定程度（语气自信或留有余地）" },
    { key: "majority",   desc: "建议与其他系统意见的一致程度（处于多数或少数）" },
  ];
  const BIPOLAR_LABELS = ["强烈预示能力低", "与能力无关", "强烈预示能力高"];
  shuffle(FEATURES).forEach((f, i) => {
    for (const frame of ["task", "general"]) {
      const stem = frame === "task"
        ? `就你刚才评估的这三套系统而言，${f.desc}，在多大程度上预示其真实能力？`
        : `一般而言，${f.desc}，在多大程度上预示 AI 系统的真实能力？`;
      tl.push({
        type: jsPsychHtmlSliderResponse,
        stimulus: `<div class="likert-statement">${stem}</div>`,
        min: -100,
        max: 100,
        slider_start: 0,
        step: 1,
        labels: BIPOLAR_LABELS,
        require_movement: true,
        button_label: "继续",
        data: { record_type: "posttask", scale: "cue_validity_belief",
                feature: f.key, frame, feature_order: i },
      });
    }
  });

  // ---- 冲突归因（探索性三角验证；对照臂改为假设形式）
  const attribStem = arm === "conflict"
    ? "当三套系统意见不一致时，您认为最主要的原因是什么？"
    : "如果这三套系统给出不一致的建议，您认为最主要的原因会是什么？";
  tl.push({
    type: jsPsychSurveyMultiChoice,
    questions: [{
      prompt: attribStem,
      options: ["三套系统的能力不同",
                "三套系统建议所依据的信息不同",
                "三套系统的输出本身存在随机波动",
                "其他原因"],
      required: true,
      name: "conflict_attribution",
    }],
    button_label: "继续",
    data: { record_type: "posttask", scale: "conflict_attribution", arm },
  });
  tl.push({
    type: jsPsychSurveyText,
    questions: [{
      prompt: "如果愿意，请简要说明您作出上述选择的理由。",
      placeholder: "（可跳过）",
      rows: 3,
      required: false,
      name: "conflict_attribution_open",
    }],
    button_label: "继续",
    data: { record_type: "posttask", scale: "conflict_attribution_open", arm },
  });

  // ---- 人口学
  tl.push({
    type: jsPsychSurveyText,
    questions: [{
      prompt: "您的年龄（周岁）：",
      placeholder: "请填数字",
      columns: 10,
      required: true,
      name: "age",
    }],
    button_label: "继续",
    data: { record_type: "posttask", scale: "demographics" },
  });
  tl.push({
    type: jsPsychSurveyMultiChoice,
    questions: [
      { prompt: "您的性别：",
        options: ["男", "女", "其他 / 不便透露"],
        required: true, name: "gender" },
      { prompt: "您的最高学历（含在读）：",
        options: ["高中及以下", "大专 / 高职", "本科", "硕士", "博士及以上"],
        required: true, name: "education" },
      { prompt: "您目前所处的职业领域：",
        options: ["在校学生", "金融 / 银行 / 保险", "信息技术 / 互联网",
                  "制造 / 工程", "政府 / 公共部门", "教育 / 科研", "其他"],
        required: true, name: "occupation" },
      { prompt: "您在工作或学习中使用 AI 工具（如大语言模型、智能推荐系统等）的频率：",
        options: ["从不", "每月少于一次", "每月数次", "每周数次", "几乎每天"],
        required: true, name: "ai_usage" },
    ],
    button_label: "继续",
    data: { record_type: "posttask", scale: "demographics" },
  });

  // ---- funnel debrief（3 题，开放文本均可选）
  tl.push({
    type: jsPsychSurveyText,
    preamble: "<p>最后，请回答三个关于本研究整体的问题。以下题目均可选答。</p>",
    questions: [
      { prompt: "您觉得本研究的真正研究目的是什么？请写下您的猜测。",
        placeholder: "（可跳过）", rows: 4, required: false, name: "funnel_purpose" },
      { prompt: "在刚才的作答过程中，您是否发现任何异常或不合理之处？若有，请简要描述。",
        placeholder: "（可跳过）", rows: 4, required: false, name: "funnel_anomaly" },
      { prompt: "您对本实验的设计有何建议？",
        placeholder: "（可选）", rows: 4, required: false, name: "funnel_suggestion" },
    ],
    button_label: "提交",
    data: { record_type: "posttask", scale: "funnel_debrief" },
  });

  return tl;
}

global.Questionnaires = { buildPreTask, buildScalePoint, buildPostTask };
})(typeof window !== "undefined" ? window : globalThis);
