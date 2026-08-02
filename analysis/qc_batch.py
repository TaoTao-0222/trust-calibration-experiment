"""qc_batch.py — 软启动批量质检（30 人份 DataPipe 数据）

扫描一个目录里的 saveChunk JSON（DataPipe 下载，文件名 `{session}-{part}.json`），
按 session 归组、取试次最多的分块为代表，逐场输出：
  - 完整性：分块齐不齐、试次数、用时、完成码；
  - 数据质量：调用 validate_session 的五类校验（仅对 250 试次完整的场次）；
  - 作答行为：RT 分布、I_conf 滑条方差（直线作答）、|F-I|、照抄建议率；
  - 问卷：注意力检查 ac_1/ac_2 通过与否、理解检查尝试次数、量表点/探针计数。

并在末尾给出跨被试汇总与建议剔除标记（不自动剔除，仅供判断）。

用法：
  python qc_batch.py [目录]            # 缺省 sessions/，自动跳过 e2e-* 测试文件
  python qc_batch.py sessions --include-e2e --csv qc.csv
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

import numpy as np  # noqa: E402

import validate_session as vs  # noqa: E402

PARTS = ("P1", "P2", "P3", "final")
AC_ANSWER = {1: 4, 2: 4}          # 原始记录值（0 基下标），“比较同意”= 第 5 档。
                                  # 注意：2026-08-02 先导批次（62 场）AC2 用旧锚点（正确值 5），
                                  # 该批 AC2 一律不作剔除依据；现值仅适用于修复后的正式数据。
MIN_MINUTES = 15.0                # 全场用时下限（250 试次 + 问卷，低于此值可疑）
COPY_TOL = 0.005                  # F/100 与建议 a 的判定容差


def load_chunks(folder):
    files = sorted(glob.glob(os.path.join(folder, "*.json")))
    sessions = {}
    skipped = []
    for f in files:
        base = os.path.basename(f)
        try:
            with open(f, encoding="utf-8") as fh:
                d = json.load(fh)
        except Exception as e:  # noqa: BLE001
            skipped.append(f"{base}: 解析失败 {e}")
            continue
        sid = d.get("session") or base.rsplit("-", 1)[0]
        sessions.setdefault(sid, {})[d.get("part", "?")] = d
    return sessions, skipped


def responses_of(d):
    r = d.get("responses", [])
    if isinstance(r, str):
        try:
            r = json.loads(r)
        except Exception:  # noqa: BLE001
            r = []
    return r


def session_metrics(d):
    """从代表分块提取行为指标。"""
    m = {}
    trials = d.get("trials", [])
    m["n_trials"] = len(trials)
    m["elapsed_min"] = d.get("elapsed_min")

    rtI = np.array([t["rt_I"] for t in trials if t.get("rt_I")], dtype=float)
    rtF = np.array([t["rt_F"] for t in trials if t.get("rt_F")], dtype=float)
    if len(rtI):
        m["rtI_med"] = float(np.median(rtI))
        m["rtI_fast%"] = float(np.mean(rtI < 300) * 100)
    if len(rtF):
        m["rtF_med"] = float(np.median(rtF))
        m["rtF_fast%"] = float(np.mean(rtF < 300) * 100)

    iconf = np.array([t["I_conf"] for t in trials if t.get("I_conf") is not None],
                     dtype=float)
    if len(iconf):
        m["iconf_sd"] = float(np.std(iconf))

    di, copy = [], 0
    for t in trials:
        if t.get("I") is None or t.get("F") is None:
            continue
        di.append(abs(t["F"] - t["I"]))
        advs = [t["advice"][a]["a"] for a in t.get("present", [])
                if t.get("advice", {}).get(a, {}).get("a") is not None]
        if advs and any(abs(t["F"] / 100 - a) <= COPY_TOL for a in advs):
            copy += 1
    if di:
        m["|F-I|_mean"] = float(np.mean(di))
        m["F=I%"] = float(np.mean(np.array(di) == 0) * 100)
        m["F=建议%"] = copy / len(di) * 100

    resp = responses_of(d)
    ac = {r.get("ac_id"): r for r in resp if r.get("record_type") == "attention_check"}
    for ac_id, want in AC_ANSWER.items():
        r = ac.get(ac_id)
        got = None
        if r and isinstance(r.get("response"), dict) and r["response"]:
            got = next(iter(r["response"].values()))
        m[f"ac{ac_id}_pass"] = (got == want) if got is not None else None
    m["comprehension_尝试"] = sum(1 for r in resp
                                  if r.get("record_type") == "comprehension")
    m["scale点数"] = len({r.get("point") for r in resp
                        if r.get("record_type") == "scale"})
    m["probe数"] = sum(1 for r in resp if r.get("record_type") == "probe")
    m["完成码"] = any(r.get("record_type") == "completion" for r in resp)
    return m


def flags_for(d, m, problems):
    fl = []
    if m["n_trials"] != 250:
        fl.append(f"不完整({m['n_trials']}试次)")
    if m.get("elapsed_min") is not None and m["elapsed_min"] < MIN_MINUTES:
        fl.append(f"用时过短({m['elapsed_min']:.0f}min)")
    if m.get("rtI_fast%", 0) > 5:
        fl.append(f"初判过快({m['rtI_fast%']:.0f}%)")
    if m.get("rtF_fast%", 0) > 5:
        fl.append(f"终判过快({m['rtF_fast%']:.0f}%)")
    if m.get("iconf_sd") is not None and m["iconf_sd"] < 1e-9:
        fl.append("置信滑条零方差")
    if m.get("ac1_pass") is False:
        fl.append("AC1未过")
    if m.get("ac2_pass") is False:
        fl.append("AC2未过")
    if m.get("F=I%") is not None and m["F=I%"] > 95:
        fl.append("从不采纳(F=I)")
    if m.get("F=建议%") is not None and m["F=建议%"] > 95:
        fl.append("全程照抄建议")
    if problems:
        fl.append(f"校验{len(problems)}问题")
    return fl


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", nargs="?", default=os.path.join(ROOT, "sessions"))
    ap.add_argument("--include-e2e", action="store_true",
                    help="不跳过测试会话（e2e-* 及 id 含 test 者）")
    ap.add_argument("--csv", help="逐场指标写出 CSV 的路径")
    args = ap.parse_args()

    sessions, skipped = load_chunks(args.folder)
    if not args.include_e2e:
        sessions = {s: v for s, v in sessions.items()
                    if not s.startswith("e2e-") and "test" not in s.lower()}
    for s in skipped:
        print("跳过:", s)

    rows = []
    for sid in sorted(sessions):
        chunks = sessions[sid]
        # 代表分块：先试次数最多，并列取阶段靠后者（P3 与 final 同为 250 试次，final 更全）
        rep = max(chunks.values(),
                  key=lambda d: (len(d.get("trials", [])),
                                 PARTS.index(d.get("part"))
                                 if d.get("part") in PARTS else -1))
        problems = []
        if len(rep.get("trials", [])) == 250:
            vs.check_structure(rep, problems, False)
            vs.check_schedule(rep, problems)
            vs.check_texts(rep, problems)
            vs.check_scores(rep, problems)
            vs.check_meta(rep, problems)
        m = session_metrics(rep)
        m.update(session=sid, arm=rep.get("arm"),
                 parts="/".join(p for p in PARTS if p in chunks),
                 problems=len(problems))
        m["flags"] = ";".join(flags_for(rep, m, problems))
        rows.append((m, problems))

    # ---- 逐场一行
    hdr = (f"{'session':<22} {'臂':<8} {'分块':<15} {'试次':>4} {'用时':>6} "
           f"{'RT_I':>6} {'RT_F':>6} {'快I%':>5} {'|F-I|':>6} {'F=I%':>5} "
           f"{'抄建议%':>6} {'AC':<5} {'理解':>4} {'问题':>4}  标记")
    print(hdr)
    print("-" * len(hdr))
    for m, problems in rows:
        acs = "".join("√" if m.get(f"ac{i}_pass") else ("✗" if m.get(f"ac{i}_pass") is False else "?")
                      for i in (1, 2))
        print(f"{m['session']:<22} {str(m['arm']):<8} {m['parts']:<15} "
              f"{m['n_trials']:>4} {(m['elapsed_min'] or 0):>6.1f} "
              f"{m.get('rtI_med', 0):>6.0f} {m.get('rtF_med', 0):>6.0f} "
              f"{m.get('rtI_fast%', 0):>5.1f} {m.get('|F-I|_mean', 0):>6.1f} "
              f"{m.get('F=I%', 0):>5.1f} {m.get('F=建议%', 0):>6.1f} "
              f"{acs:<5} {m['comprehension_尝试']:>4} {m['problems']:>4}  {m['flags']}")

    # ---- 汇总
    n = len(rows)
    done = [m for m, _ in rows if m["n_trials"] == 250]
    arms = {}
    for m, _ in rows:
        arms[m["arm"]] = arms.get(m["arm"], 0) + 1
    print(f"\n共 {n} 场（臂分布 {arms}），250 试次完整 {len(done)} 场")
    if done:
        el = np.array([m["elapsed_min"] for m in done if m.get("elapsed_min")])
        if len(el):
            q = np.percentile(el, [0, 25, 50, 75, 100])
            print(f"用时(min)：min {q[0]:.0f} / Q1 {q[1]:.0f} / 中位 {q[2]:.0f} "
                  f"/ Q3 {q[3]:.0f} / max {q[4]:.0f}")
        for k, lab in (("rtI_med", "初判RT中位(ms)"), ("rtF_med", "终判RT中位(ms)"),
                       ("|F-I|_mean", "|F-I|均值"), ("F=I%", "F=I比例%"),
                       ("F=建议%", "照抄建议%")):
            v = np.array([m[k] for m in done if m.get(k) is not None])
            if len(v):
                print(f"{lab}：中位 {np.median(v):.1f}（{v.min():.1f}–{v.max():.1f}）")
        ac1 = [m["ac1_pass"] for m in done if m.get("ac1_pass") is not None]
        ac2 = [m["ac2_pass"] for m in done if m.get("ac2_pass") is not None]
        if ac1:
            print(f"AC1 通过率 {np.mean(ac1):.0%}（{sum(ac1)}/{len(ac1)}）"
                  f"；AC2 通过率 {np.mean(ac2):.0%}（{sum(ac2)}/{len(ac2)}）")
        n_flag = sum(1 for m, _ in rows if m["flags"])
        print(f"带剔除标记 {n_flag}/{n} 场（标记仅供人工判断，未自动剔除）")

    bad = [(m, p) for m, p in rows if p]
    if bad:
        print("\n校验问题明细（每场前 5 条）：")
        for m, problems in bad:
            print(f"  {m['session']}:")
            for p in problems[:5]:
                print("    ✗", p)

    if args.csv:
        import csv
        keys = ["session", "arm", "parts", "n_trials", "elapsed_min",
                "rtI_med", "rtF_med", "rtI_fast%", "rtF_fast%", "iconf_sd",
                "|F-I|_mean", "F=I%", "F=建议%", "ac1_pass", "ac2_pass",
                "comprehension_尝试", "scale点数", "probe数", "完成码",
                "problems", "flags"]
        with open(args.csv, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
            w.writeheader()
            for m, _ in rows:
                w.writerow(m)
        print(f"\nCSV 已写出：{args.csv}")


if __name__ == "__main__":
    main()
