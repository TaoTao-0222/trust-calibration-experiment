// trials.js — JAS 两阶段试次与反馈的自定义 jsPsych 插件（对应设计文档 §4.2/§4.5）
//
// JasJudgePlugin（type: "initial" | "final"）：
//   initial —— 案例卡 + 初判滑条(0–100) + 信心滑条(1–7)；
//   final   —— 案例卡（压缩）+ 顾问建议卡（徽标/数值/文本 或 纯数字）+ 终判滑条。
// FeedbackPlugin：真值结果 + 在场顾问得分 + 自身初/终判得分（按钮继续，记录阅读时长）。
// 两插件均实现 simulate()（jsPsych data-only 仿真，端到端自检用）。

// ---------------------------------------------------------------- 共用样式件
function advisorBadge(name, color) {
  return `<span class="adv-badge" style="background:${color}">${name}</span>`;
}

function caseCard(c, compact) {
  const inds = Object.values(c.indicators).map(d =>
    `<span class="ind-chip">${d.name} <b>${d.display}</b></span>`).join("");
  return `<div class="case-card${compact ? " compact" : ""}">
    <div class="case-vignette">${c.vignette}</div>
    <div class="ind-row">${inds}</div>
  </div>`;
}

function sliderRow(label, min, max, start, id, leftLabel, rightLabel) {
  return `<div class="slider-row">
    <div class="slider-label">${label}</div>
    <div class="slider-wrap">
      <span class="slider-end">${leftLabel}</span>
      <input type="range" id="${id}" min="${min}" max="${max}" value="${start}" step="1">
      <span class="slider-end">${rightLabel}</span>
      <span class="slider-val" id="${id}-val"></span>
    </div>
  </div>`;
}

function bindSlider(id) {
  const el = document.getElementById(id), out = document.getElementById(id + "-val");
  const upd = () => { out.textContent = el.value; };
  el.addEventListener("input", upd); upd();
  return () => Number(el.value);
}

// ---------------------------------------------------------------- JAS 判断屏
class JasJudgePlugin {
  static info = {
    name: "jas-judge",
    parameters: {
      stage: { default: "initial" },               // "initial" | "final"
      case_data: { default: null },
      advisors: { default: [] },                   // [{name,color,prob,text,pure_number}]
      require_change: { default: false },
      autopilot: { default: false },
    },
  };
  constructor(jsPsych) { this.jsPsych = jsPsych; }

  trial(display, trial) {
    const t0 = performance.now();
    const c = trial.case_data;
    let html = caseCard(c, trial.stage === "final");
    if (trial.stage === "final") {
      const cards = trial.advisors.map(a => `
        <div class="adv-card">
          <div class="adv-head">${advisorBadge(a.name, a.color)}
            <span class="adv-prob">${Math.round(100 * a.prob)}%</span></div>
          ${a.pure_number
            ? '<div class="adv-text pn">（该系统仅给出数值估计）</div>'
            : `<div class="adv-text">${a.text}</div>`}
        </div>`).join("");
      html += `<div class="adv-row">${cards}</div>`;
      html += sliderRow("您的最终估计（违约概率 %）：", 0, 100, trial.I_init ?? 50,
        "jas-F", "0%", "100%");
    } else {
      html += sliderRow("您的初步估计（违约概率 %）：", 0, 100, 50, "jas-I", "0%", "100%");
      html += sliderRow("您对初步估计的信心：", 1, 7, 4, "jas-C", "1 很低", "7 很高");
    }
    html += `<div class="btn-row"><button id="jas-ok" class="jspsych-btn">确定</button></div>`;
    display.innerHTML = html;

    const getI = trial.stage === "initial" ? bindSlider("jas-I") : null;
    const getC = trial.stage === "initial" ? bindSlider("jas-C") : null;
    const getF = trial.stage === "final" ? bindSlider("jas-F") : null;

    const finish = () => {
      const rt = Math.round(performance.now() - t0);
      const data = { rt };
      if (trial.stage === "initial") { data.I = getI(); data.I_conf = getC(); }
      else { data.F = getF(); }
      this.jsPsych.finishTrial(data);
    };
    document.getElementById("jas-ok").addEventListener("click", finish);

    if (trial.autopilot) {
      const set = (id, v) => { const el = document.getElementById(id);
        if (el) { el.value = v; el.dispatchEvent(new Event("input")); } };
      setTimeout(() => {
        if (trial.stage === "initial") { set("jas-I", 20 + Math.floor(Math.random() * 60));
          set("jas-C", 2 + Math.floor(Math.random() * 5)); }
        else set("jas-F", 20 + Math.floor(Math.random() * 60));
        finish();
      }, 120 + Math.random() * 180);
    }
  }

  simulate(trial, mode, opts, cb) {
    const data = trial.stage === "initial"
      ? { rt: 800, I: 20 + Math.floor(Math.random() * 60), I_conf: 2 + Math.floor(Math.random() * 5) }
      : { rt: 900, F: 20 + Math.floor(Math.random() * 60) };
    cb(); this.jsPsych.finishTrial(data);
  }
}
window.JasJudgePlugin = JasJudgePlugin;

// ---------------------------------------------------------------- 反馈屏
class FeedbackPlugin {
  static info = {
    name: "jas-feedback",
    parameters: {
      case_data: { default: null },
      outcome: { default: null },                  // 0/1
      advisors: { default: [] },                   // [{name,color,prob,score}]
      self_scores: { default: null },              // {I: x, F: y}
      autopilot: { default: false },
    },
  };
  constructor(jsPsych) { this.jsPsych = jsPsych; }

  trial(display, trial) {
    const t0 = performance.now();
    const oc = trial.outcome === 1
      ? '<span class="oc-yes">该企业实际发生了债务违约</span>'
      : '<span class="oc-no">该企业未发生债务违约</span>';
    const rows = trial.advisors.map(a => `
      <tr><td>${advisorBadge(a.name, a.color)}</td><td>${Math.round(100 * a.prob)}%</td>
      <td><b>${a.score}</b></td></tr>`).join("");
    const s = trial.self_scores;
    display.innerHTML = `
      <div class="fb-card">
        <div class="fb-truth">真值揭晓：${oc}</div>
        <table class="fb-table">
          <thead><tr><th>系统</th><th>估计</th><th>本局得分</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr><td>您（初判）</td><td>${s.I_val}%</td><td><b>${s.I}</b></td></tr>
            <tr><td>您（终判）</td><td>${s.F_val}%</td><td><b>${s.F}</b></td></tr>
          </tfoot>
        </table>
        <div class="btn-row"><button id="fb-ok" class="jspsych-btn">继续</button></div>
      </div>`;
    const finish = () => this.jsPsych.finishTrial({ rt: Math.round(performance.now() - t0) });
    document.getElementById("fb-ok").addEventListener("click", finish);
    if (trial.autopilot) setTimeout(finish, 100 + Math.random() * 150);
  }

  simulate(trial, mode, opts, cb) { cb(); this.jsPsych.finishTrial({ rt: 700 }); }
}
window.FeedbackPlugin = FeedbackPlugin;

// ---------------------------------------------------------------- 稀疏探针屏（P2 约 20% 试次后）
class ProbePlugin {
  static info = {
    name: "jas-probe",
    parameters: {
      advisor: { default: null },                  // {name,color,prob,text,pure_number}
      autopilot: { default: false },
    },
  };
  constructor(jsPsych) { this.jsPsych = jsPsych; }

  trial(display, trial) {
    const t0 = performance.now();
    const a = trial.advisor;
    display.innerHTML = `
      <div class="probe-card">
        <div class="probe-head">请仅针对 ${advisorBadge(a.name, a.color)} 刚才那条建议评分：</div>
        ${a.pure_number ? "" : `<div class="adv-text">${a.text}</div>`}
        ${sliderRow("这条建议的论证有多充分？", 1, 7, 4, "pb-rich", "1 很不充分", "7 很充分")}
        ${sliderRow("这条建议的语气有多确定？", 1, 7, 4, "pb-conf", "1 很犹豫", "7 很确定")}
        <div class="btn-row"><button id="pb-ok" class="jspsych-btn">确定</button></div>
      </div>`;
    const getR = bindSlider("pb-rich"), getC = bindSlider("pb-conf");
    const finish = () => this.jsPsych.finishTrial({
      rt: Math.round(performance.now() - t0), rich: getR(), conf: getC() });
    document.getElementById("pb-ok").addEventListener("click", finish);
    if (trial.autopilot) setTimeout(finish, 100 + Math.random() * 120);
  }

  simulate(trial, mode, opts, cb) {
    cb();
    this.jsPsych.finishTrial({ rt: 500, rich: 1 + Math.floor(Math.random() * 7),
      conf: 1 + Math.floor(Math.random() * 7) });
  }
}
window.ProbePlugin = ProbePlugin;
