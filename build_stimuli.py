"""build_stimuli.py — 把 Python 侧材料/参数编译成浏览器可用的 JS 数据模块

唯一真源原则：案例池（实验材料/output/case_pool.json）、文本模板
（实验材料/text_templates.py）、实验常量（模拟/src/simulate.py、design.py、
模拟/output/sigma_calibration.json）全部从 Python 侧读取并编译为 stimuli/*.js，
JS 端不含任何手写参数，杜绝两侧逻辑漂移。

生成：
  stimuli/case_pool.js   案例池（270 案例：行业/小传/四指标/p_default/难度）
  stimuli/templates.js   模板表（结论句/开头/引述句查找表/版本号/禁词与标记表）
  stimuli/params.js      真值规则系数、σ 标定表、发散脚本参数、排程常量、目标得分

用法：python build_stimuli.py
"""

from __future__ import annotations

import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "..", "实验材料"))
sys.path.insert(0, os.path.join(ROOT, "..", "模拟", "src"))

import case_pool           # noqa: E402
import text_templates      # noqa: E402
import design              # noqa: E402
import simulate            # noqa: E402

OUT = os.path.join(ROOT, "stimuli")


def _write_js(name, header, body):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"// 由 build_stimuli.py 自动生成（{header}），请勿手改\n{body}\n")
    print("已生成", path)


def _dump(obj):
    return json.dumps(obj, ensure_ascii=False)


# ---------------------------------------------------------------- case_pool.js
def build_case_pool():
    pool_path = os.path.join(ROOT, "..", "实验材料", "output", "case_pool.json")
    with open(pool_path, encoding="utf-8") as f:
        rows = json.load(f)
    cases = []
    for r in rows:
        cases.append(dict(
            industry=r["industry"], category=r["category"], company=r["company"],
            p=r["p_default"], difficulty=r["difficulty"], vignette=r["vignette"],
            indicators=dict(
                debt=dict(name="资产负债率", display=r["debt_display"], value=r["debt_value"]),
                cash=dict(name="现金短债比", display=r["cash_display"], value=r["cash_value"]),
                boom=dict(name="行业景气指数", display=r["boom_display"], value=r["boom_value"]),
                history=dict(name="历史违约记录", display=r["history_display"],
                             value=r["history_value"]),
            )))
    src = hashlib.md5(json.dumps(rows, sort_keys=True).encode()).hexdigest()[:8]
    body = (f"const CASE_POOL = {_dump(cases)};\n"
            f"const CASE_POOL_SRC = '{src}';\n"
            "if (typeof module !== 'undefined') module.exports = { CASE_POOL, CASE_POOL_SRC };")
    _write_js("case_pool.js", f"来源 实验材料/output/case_pool.json md5={src}", body)


# ---------------------------------------------------------------- templates.js
def _cite_phrases():
    """调用 text_templates.cite_indicator，按 (key, band, style) 提取引述句模板。

    返回 {key: {band: {style: 短语（{disp}/{n} 占位）}}}；JS 端只做查找 + 格式化。
    """
    # 每个指标各分档的代表值（取自 case_pool.INDICATORS 的分档边界）
    reps = {
        "debt": {"偏低": 30.0, "中等": 55.0, "偏高": 80.0},
        "cash": {"偏低": 0.5, "中等": 1.2, "偏高": 2.2},
        "boom": {"偏低": 30.0, "中等": 55.0, "偏高": 80.0},
        "history": {"无": 0, "少": 2, "多": 4},
    }
    out = {}
    for key, bands in reps.items():
        out[key] = {}
        for band, v in bands.items():
            # 用渲染器拿真实 display 串（保证与线上案例格式一致）
            ind_map = case_pool.render_indicators([0.0, 0.0, 0.0, 0.0])
            ind_map[key] = dict(ind_map[key], value=v,
                                display=(f"{v:.1f}" if key == "cash"
                                         else (f"近五年 {v} 次" if key == "history" and v > 0
                                               else ("近五年无" if key == "history"
                                                     else f"{v:.0f}%"))))
            out[key][band] = {}
            for style in ("hedge", "confident"):
                phrase = text_templates.cite_indicator(key, ind_map, style)
                # 把具体数值换回占位符
                phrase = phrase.replace(ind_map[key]["display"], "{disp}")
                if key == "history" and v > 0:
                    phrase = phrase.replace(str(v), "{n}")
                out[key][band][style] = phrase
    return out


def build_templates():
    body = (
        f"const TEMPLATE_VERSION = '{text_templates.TEMPLATE_VERSION}';\n"
        f"const CONCLUSION_ONLY = {_dump(text_templates.CONCLUSION_ONLY)};\n"
        f"const OPENERS = {_dump(text_templates.OPENERS)};\n"
        f"const CONCLUSIONS = {_dump(text_templates.CONCLUSIONS)};\n"
        f"const CITE_PHRASES = {_dump(_cite_phrases())};\n"
        f"const CONFIDENT_MARKERS = {_dump(text_templates.CONFIDENT_MARKERS)};\n"
        f"const HEDGE_MARKERS = {_dump(text_templates.HEDGE_MARKERS)};\n"
        f"const BANNED_TOKENS = {_dump(text_templates.BANNED_TOKENS)};\n"
        "if (typeof module !== 'undefined') module.exports = { TEMPLATE_VERSION,"
        " CONCLUSION_ONLY, OPENERS, CONCLUSIONS, CITE_PHRASES, CONFIDENT_MARKERS,"
        " HEDGE_MARKERS, BANNED_TOKENS };")
    _write_js("templates.js",
              f"来源 实验材料/text_templates.py v{text_templates.TEMPLATE_VERSION}", body)


# ---------------------------------------------------------------- params.js
def build_params():
    sig_path = os.path.join(ROOT, "..", "模拟", "output", "sigma_calibration.json")
    with open(sig_path, encoding="utf-8") as f:
        sigmas = json.load(f)
    cfg = design.DesignConfig()
    params = dict(
        theta_case=list(simulate.THETA_CASE),
        clip=list(simulate.CLIP),
        d_scale=simulate.D_SCALE,
        rho_low=simulate.RHO_LOW, q_close=simulate.Q_CLOSE,
        r_far=simulate.R_FAR, maj_hit=simulate.MAJ_HIT,
        script_order=list(simulate.SCRIPT_ORDER),
        advisors=list(design.ADVISORS),
        feature_combos=[list(c) for c in design.FEATURE_COMBOS],
        sigmas={k: {d: sigmas[k][d] for d in simulate.SCRIPT_ORDER}
                for k in design.ADVISORS},
        base_brier=sigmas["base_brier"],
        target_scores=cfg.target_scores,
        n_p1=cfg.n_p1, n_p2=cfg.n_p2, n_p3=cfg.n_p3,
        p2_divergence_counts=cfg.p2_divergence_counts,
        pure_number_frac=cfg.pure_number_frac,
        majority_hit_rate=cfg.majority_hit_rate,
        p2_control_counts=cfg.p2_control_counts,
        max_resample=cfg.max_resample,
        tol_advisor_combo=list(cfg.tol_advisor_combo),
        tol_cell=cfg.tol_cell,
        tol_minority=list(cfg.tol_minority),
        max_same_combo_trials=cfg.max_same_combo_trials,
        text_template_version=design.TEXT_TEMPLATE_VERSION,
    )
    body = (f"const PARAMS = {_dump(params)};\n"
            "if (typeof module !== 'undefined') module.exports = { PARAMS };")
    _write_js("params.js", "来源 模拟/src/simulate.py、design.py、output/sigma_calibration.json",
              body)


def main():
    os.makedirs(OUT, exist_ok=True)
    build_case_pool()
    build_templates()
    build_params()


if __name__ == "__main__":
    main()
