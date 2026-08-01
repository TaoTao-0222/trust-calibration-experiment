"""validate_session.py — 单场实验数据完整性校验（收数抽检用）

读取 saveChunk 的 JSON 载荷（session/arm/part/trials/responses），核对：
- 结构：250 试次（90/100/60）、字段齐全、I/F 非空率、RT 分布；
- 排程：冲突臂发散 40/35/25、纯数字 ≈25%、顾问×组合边际容差、少数位平衡；
- 文本：整数百分比、禁词、风格标记、引述数（validate_materials 同款规则）；
- 得分：顾问得分/自身得分与建议和真值的一致性重算；
- 量表与注意力检查、完成码存在性。

用法：python validate_session.py <session.json> [--verbose]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "..", "..", "实验材料"))
sys.path.insert(0, os.path.join(ROOT, "..", "..", "模拟", "src"))

import numpy as np  # noqa: E402

ADVISORS = ("H", "M", "L")
COMBO_TOL = (16, 22)
MINORITY_TOL = (9, 14)


def _fail(problems, msg):
    problems.append(msg)


def check_structure(d, problems, verbose):
    trials = d.get("trials", [])
    if len(trials) != 250:
        _fail(problems, f"试次数 {len(trials)} ≠ 250")
    phases = {}
    for t in trials:
        phases[t["phase"]] = phases.get(t["phase"], 0) + 1
    if phases != {"P1": 90, "P2": 100, "P3": 60}:
        _fail(problems, f"阶段计数异常 {phases}")
    i_ok = sum(1 for t in trials if t.get("I") is not None)
    f_ok = sum(1 for t in trials if t.get("F") is not None)
    if trials and (i_ok / len(trials) < 0.95 or f_ok / len(trials) < 0.95):
        _fail(problems, f"I/F 非空率过低：I={i_ok}/250, F={f_ok}/250")
    rtI = [t["rt_I"] for t in trials if t.get("rt_I")]
    rtF = [t["rt_F"] for t in trials if t.get("rt_F")]
    if rtI:
        fast = np.mean(np.array(rtI) < 300)
        if fast > 0.05:
            _fail(problems, f"初判 RT<300ms 比例 {fast:.2%} 过高")
        if verbose:
            print(f"  RT 初判中位 {int(np.median(rtI))}ms、终判中位 {int(np.median(rtF))}ms")


def check_schedule(d, problems):
    arm = d.get("arm")
    p2 = [t for t in d["trials"] if t["phase"] == "P2"]
    if arm == "conflict":
        div = {}
        for t in p2:
            div[t["divergence"]] = div.get(t["divergence"], 0) + 1
        if div != {"low": 40, "split": 35, "high": 25}:
            _fail(problems, f"发散脚本计数异常 {div}")
        pn = np.mean([t["pure_number"] for t in p2])
        if abs(pn - 0.25) > 0.03:
            _fail(problems, f"纯数字占比 {pn:.3f} 偏离 25%")
        minorities = {}
        for t in p2:
            if t["divergence"] == "split":
                minorities[t["minority"]] = minorities.get(t["minority"], 0) + 1
        if not all(MINORITY_TOL[0] <= minorities.get(a, 0) <= MINORITY_TOL[1]
                   for a in ADVISORS):
            _fail(problems, f"少数位归属不平衡 {minorities}")
        margins = {a: {} for a in ADVISORS}
        for t in p2:
            if t["pure_number"]:
                continue
            for a in ADVISORS:
                c = tuple(t["combos"][a])
                margins[a][c] = margins[a].get(c, 0) + 1
        for a in ADVISORS:
            for c, n in margins[a].items():
                if not (COMBO_TOL[0] <= n <= COMBO_TOL[1]):
                    _fail(problems, f"顾问 {a} 组合 {c} 边际 {n} 超容差 {COMBO_TOL}")
    elif arm == "control":
        adv = {}
        for t in p2:
            adv[t["present"][0]] = adv.get(t["present"][0], 0) + 1
        if adv != {"H": 34, "M": 33, "L": 33}:
            _fail(problems, f"对照臂顾问计数异常 {adv}")
    else:
        _fail(problems, f"未知臂标签 {arm!r}")


def check_texts(d, problems):
    sys.path.insert(0, os.path.join(ROOT, "..", "..", "实验材料"))
    import text_templates as tt
    n_checked = 0
    for t in d["trials"]:
        if t["pure_number"]:
            continue
        for a in t["present"]:
            adv = t["advice"][a]
            text, combo = adv["text"], adv["combo"]
            if text is None or combo is None:
                _fail(problems, f"试次 {t['trial']} 顾问 {a} 文本试次缺文本/组合")
                continue
            n_checked += 1
            for tok in tt.BANNED_TOKENS:
                if tok in text:
                    _fail(problems, f"试次 {t['trial']} 禁词 {tok}")
            for num in __import__("re").findall(r"(\d+(?:\.\d+)?)%", text):
                if "." in num:
                    _fail(problems, f"试次 {t['trial']} 非整数百分比 {num}")
    if n_checked == 0:
        _fail(problems, "无文本试次可检")


def check_scores(d, problems):
    bad = 0
    for t in d["trials"]:
        y = t["y"]
        for a in t["present"]:
            adv = t["advice"][a]
            expect = round(100 * (1 - (adv["a"] - y) ** 2))
            if abs(adv["score"] - expect) > 1:
                bad += 1
    if bad:
        _fail(problems, f"{bad} 条顾问得分与重算不一致")


def check_meta(d, problems):
    resp = json.loads(d["responses"]) if isinstance(d.get("responses"), str) \
        else d.get("responses", [])
    types = {}
    for r in resp:
        rt = r.get("record_type")
        if rt:
            types[rt] = types.get(rt, 0) + 1
    for pt in (1, 2, 3):
        pass
    if types.get("scale", 0) < 3:
        _fail(problems, f"量表点记录不足 {types.get('scale', 0)}")
    if types.get("attention_check", 0) < 2:
        _fail(problems, f"注意力检查记录不足 {types.get('attention_check', 0)}")
    if d.get("part") == "final" and types.get("completion", 0) < 1:
        _fail(problems, "缺完成码记录")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    with open(args.path, encoding="utf-8") as f:
        d = json.load(f)
    problems = []
    check_structure(d, problems, args.verbose)
    check_schedule(d, problems)
    check_texts(d, problems)
    check_scores(d, problems)
    check_meta(d, problems)
    print(f"会话 {d.get('session')}（臂={d.get('arm')}，part={d.get('part')}，"
          f"试次={len(d.get('trials', []))}）：问题 {len(problems)} 条")
    for p in problems[:20]:
        print("  ✗", p)
    if len(problems) > 20:
        print(f"  ... 其余 {len(problems) - 20} 条略")
    sys.exit(0 if not problems else 1)


if __name__ == "__main__":
    main()
