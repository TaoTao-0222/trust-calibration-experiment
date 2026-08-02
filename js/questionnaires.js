// questionnaires.js — 前测 / 量表点 / 后测问卷（jsPsych 8，浏览器 <script> 加载，挂 window.Questionnaires）
//
// 版本：v1.0 冻结稿（2026-08-02 文献核对后修订，逐条核对见 实验程序/量表条目文献核对.md）。
//   - 信任倾向   4 题：ptt_1–2（人际簇）参照 Mayer & Davis (1999, JAP 84(1):123–136)
//                propensity to trust 的 faith-in-humanity 构念自编概括条目；ptt_3–4（技术簇）
//                参照 Merritt & Ilgen (2008, Human Factors 50(2):194–210) Propensity to Trust
//                Machines 改写。两簇分别计分（或先 EFA 检验单维性），预注册中声明。
//   - AI 素养    6 题自编短版：参照 MAILS（Carolus et al., 2023, Computers in Human Behavior:
//                Artificial Humans, 1(2):100014）Know & Understand / 评估维度与 AILS
//                （Wang, Rau & Yuan, 2023, Behaviour & Information Technology, 42(9):1324–1337）
//                Evaluation 维度；未覆盖 Use & Apply / Detect AI / AI Ethics。
//   - PFI        个人无效恐惧（Personal Fear of Invalidity）6 题：Thompson et al. (2001) /
//                Neuberg et al. (1997) PFIS 14 题中选译，覆盖"难以决定 / 害怕犯错 / 事后反复"
//                三簇 + 1 反向题（pfi_6）；7 点计分与全卷一致，Ikeda et al. (2024) J-PFIS
//                用法为先例（PFI 预测意见改变而信任不预测）。
//   - 计算能力   3 题：num_1 仿 Schwartz et al. (1997) 概率→频次题型；num_2/num_3 为自编
//                仿写（非 Schwartz/Lipkus 原题）。标准答案见行内注释。
//   - 状态信任   3 题：Xu2026（IJHCI，认知信任：准确/可靠/有用）改编并按任务情境具体化。
// 各量表条目处以行内注释逐条标注来源；numeracy 与注意力检查的正确答案见对应注释。
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
      // ptt_1–2 人际簇：参照 Mayer & Davis (1999, JAP) propensity to trust 的
      // faith-in-humanity 构念自编概括条目（原 8 题均为具体社会角色题，无同构概括句）
      likertQ("一般而言，我容易信任他人。", "ptt_1"),
      likertQ("我通常认为，大多数人是值得信任的。", "ptt_2"),
      // ptt_3–4 技术簇：参照 Merritt & Ilgen (2008) Propensity to Trust Machines 改写
      //（ptt_3 ≈ 原 #6 "trust a machine even when I have little knowledge about it"；
      //  ptt_4 ≈ 原 #4/#5 "tendency to trust machines is high / easy to trust"）
      likertQ("面对不熟悉的技术系统，我倾向于先假定它是可靠的。", "ptt_3"),
      likertQ("总体而言，我容易信任新的技术系统。", "ptt_4"),
    ],
    randomize_question_order: false,
    button_label: "继续",
    data: { record_type: "pretask", scale: "propensity_to_trust" },
  };

  // ---- AI 素养（参照 MAILS [Carolus et al. 2023] Know & Understand/评估维度与
  //      AILS [Wang, Rau & Yuan 2023] Evaluation 维度自编 6 题短版；未覆盖 Use & Apply /
  //      Detect AI / AI Ethics 维度）
  const aiLiteracy = {
    type: jsPsychSurveyLikert,
    preamble: "<p>以下陈述关于您对人工智能（AI）系统的了解与使用经验，请按实际情况作答。</p>",
    questions: [
      // 自编，对应 MAILS Know & Understand 家族（"输出依据/可解释性"为合理自创）
      likertQ("我能理解 AI 系统所给出的输出是依据什么产生的。", "ail_1"),
      // 自编，≈ MAILS Know & Understand（know concepts / definitions of AI）
      likertQ("我熟悉 AI 系统的基本工作原理。", "ail_2"),
      // 自编，≈ MAILS Know & Understand "assess limitations and opportunities"
      //（评估条目在 MAILS 因子结构中并入理解维度；不是 Detect AI）
      likertQ("我能大致判断 AI 系统的输出在哪些情况下可能出错。", "ail_3"),
      // 自编，机制性知识（训练数据质量），Know & Understand 家族
      likertQ("我了解训练数据的质量会影响 AI 系统的表现。", "ail_4"),
      // 自编，介于 Know & Understand 与 Use & Apply；AILS Evaluation "choose a proper
      // solution from a smart agent" 相邻。句式统一为能力自评（与其余 5 题平行）
      likertQ("我能在采纳 AI 系统的建议之前，评估其可靠程度。", "ail_5"),
      // 自编，≈ AILS Evaluation "evaluate the capabilities and limitations of an AI"
      likertQ("我清楚 AI 系统能做什么、不能做什么。", "ail_6"),
    ],
    randomize_question_order: false,
    button_label: "继续",
    data: { record_type: "pretask", scale: "ai_literacy" },
  };

  // ---- PFI 个人无效恐惧（Personal Fear of Invalidity；Thompson et al. 2001 /
  //      Neuberg et al. 1997 的 PFIS 14 题中选译 6 题，覆盖"难以决定 / 害怕犯错 / 事后反复"
  //      三簇 + 1 反向题；7 点计分与全卷 LIKERT7 一致；Ikeda et al. 2024 的 J-PFIS（9 题 7 点）
  //      为应用先例。行内编号为原 14 题序号；pfi_6 为反向题，分析时反转计分）
  const pfi = {
    type: jsPsychSurveyLikert,
    preamble: "<p>以下陈述关于您平时做决定的方式，请按真实情况作答，没有对错之分。</p>",
    questions: [
      // 原 #3 Sometimes I become impatient over my indecisiveness.（难以决定）
      likertQ("有时我会对自己的优柔寡断感到不耐烦。", "pfi_1"),
      // 原 #6 I tend to struggle with most decisions.（难以决定）
      likertQ("我在大多数决定上都会反复纠结。", "pfi_2"),
      // 原 #5 I can be reluctant to commit myself to something because of the
      // possibility that I might be wrong.（害怕犯错）
      likertQ("因为存在出错的可能，我有时会不愿对事情做出决断。", "pfi_3"),
      // 原 #12 I wish I did not worry so much about making errors.（害怕犯错）
      likertQ("我希望自己不要那么担心犯错。", "pfi_4"),
      // 原 #7 Even after making an important decision, I continue to think about the
      // pros and cons to make sure that I am not wrong.（事后反复）
      likertQ("即使做出了重要决定，我仍会继续权衡利弊，以确认自己没有选错。", "pfi_5"),
      // 原 #10 I rarely doubt that the course of action I have selected will be
      // correct.（反向题；不向被试标注）
      likertQ("我很少怀疑自己选定的行动方案是否正确。", "pfi_6"),
    ],
    randomize_question_order: false,
    button_label: "继续",
    data: { record_type: "pretask", scale: "pfi" },
  };

  // ---- 计算能力 numeracy（3 题，填数字；num_1 仿 Schwartz et al. 1997 题型，
  //      num_2/num_3 为自编仿写——非 Schwartz/Lipkus 原题）
  const numeracy = {
    type: jsPsychSurveyText,
    preamble: "<p>以下三道题关于概率的简单计算，请在空格中填入数字（无需写单位或百分号）。</p>",
    questions: [
      // 仿 Schwartz et al. (1997) 概率→频次题型（原题：1% 概率 1000 人约 10 人中奖）。
      // 正确答案：300（30% × 1000）
      { prompt: "① 某事件发生的概率为 30%。若相同情形重复 1000 次，该事件大约会发生多少次？",
        placeholder: "请填数字", required: true, name: "num_1" },
      // 自编仿写（Lipkus et al. 2001 的 11 题无联合概率题）。正确答案：25（0.5 × 0.5 = 25%）。
      // 格式示例用 100（必然发生），避免拿常见错误答案 50 做示范造成锚定
      { prompt: "② 同时掷两枚质地均匀的硬币，两枚都是正面的概率是多少？（填百分数中的数字，如认为必然发生则填 100）",
        placeholder: "请填数字", required: true, name: "num_2" },
      // 自编仿写（Schwartz et al. 1997 无"至少一次"题型）。正确答案：19（精确 1 − 0.9² = 19%，
      // "约"字允许容差；分析端容差规则在预注册中声明）
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

  return [propensity, aiLiteracy, pfi, numeracy, attentionCheck];
}

// ================================================================ 量表点（P1/P2/P3 末）
// point ∈ {1,2,3}；advisors = [{name, color}]（三顾问显示名与徽标颜色）。
// 结构：逐顾问状态信任 3 页（每页 3 题李克特）→ 逐顾问感知校准 3 屏（0–50 滑条）。
function buildScalePoint(point, advisors) {
  if (![1, 2, 3].includes(point)) throw new Error("buildScalePoint: point 须为 1/2/3");
  if (!Array.isArray(advisors) || advisors.length === 0)
    throw new Error("buildScalePoint: advisors 须为 [{name, color}] 数组");

  const tl = [];

  // ---- 状态认知信任（Xu2026 [IJHCI] 认知信任 3 题：准确/可靠/有用，改编并按任务情境
  //      具体化；2026-08-02 文献核对通过），每顾问一页
  for (const a of advisors) {
    tl.push({
      type: jsPsychSurveyLikert,
      preamble: advisorHead(a) +
        `<div class="likert-statement">请根据您在刚才这一阶段中的实际体验，针对 ${advisorBadge(a)} 对以下陈述评分（1 = 很不同意，7 = 很同意）。</div>`,
      questions: [
        // 对应"可靠"（reliable）
        likertQ("该系统是可靠的。", `trust_rel_${a.name}`),
        // 对应"准确"（accurate）的任务化：具体化为对本任务输出（违约概率估计）的信任
        likertQ("我相信该系统给出的违约概率估计。", `trust_bel_${a.name}`),
        // 对应"有用"（useful）的能力评价表述（不用"愿意采纳"，避免与行为采纳指标循环）
        likertQ("该系统的估计对我完成评估任务是有用的。", `trust_use_${a.name}`),
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
  //      题干统一按“特征越高（pole 方向）→ 真实能力越高还是越低”发问，消除方向语义歧义。
  const FEATURES = [
    { key: "evidence",   name: "建议所附依据的充实程度",       pole: "充实" },
    { key: "confidence", name: "建议措辞的确定程度",           pole: "确定" },
    { key: "majority",   name: "建议与其他系统意见的一致程度", pole: "一致" },
  ];
  const BIPOLAR_LABELS = ["强烈预示能力低", "与能力无关", "强烈预示能力高"];
  shuffle(FEATURES).forEach((f, i) => {
    for (const frame of ["task", "general"]) {
      const stem = frame === "task"
        ? `就您刚才评估的这三套系统而言：一套系统的${f.name}越高（越${f.pole}），您认为它的真实能力越高还是越低？`
        : `一般而言：一套 AI 系统的${f.name}越高（越${f.pole}），您认为它的真实能力越高还是越低？`;
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
