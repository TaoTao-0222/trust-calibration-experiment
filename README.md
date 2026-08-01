# 实验程序：多 AI 冲突信任再分配（250 试次在线实验）

对应设计文档 v2.10 §4。jsPsych 8 静态站，无后端：排程/建议/文本全部在浏览器端生成，
数据经 DataPipe（OSF）或自建端点回收。材料与模拟管线同源（`build_stimuli.py` 编译）。

## 一、快速开始（本地）

```bash
cd 实验程序/analysis && python dev_server.py --port 8787
# 打开 http://localhost:8787/index.html?id=测试01
```

常用 URL 参数：
| 参数 | 作用 |
|---|---|
| `id=` | 被试 ID（缺省随机；同一 ID 重进页面得到同一排程） |
| `arm=` | conflict / control（缺省按 id 哈希各半） |
| `save=` | 保存端点覆盖（如 `http://localhost:8787/save`） |
| `simulate=1` | data-only 无头仿真（自动作答全场，供端到端自检） |
| `autopilot=1` | 试次屏自动作答（界面走查用，问卷仍需手点） |
| `redirect=` | 完成页回跳地址（平台领报酬链接） |

## 二、自检（改动后必跑）

```bash
node test/headless_test.js                 # 排程/建议/文本边际对等（Python 侧对照）
cd analysis && python validate_session.py sessions/<文件>.json --verbose
# 无头端到端（需 Chrome）：
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  "http://localhost:8787/index.html?id=e2e&arm=conflict&simulate=1&save=http%3A%2F%2Flocalhost%3A8787%2Fsave"
# 界面截图走查：http://localhost:8787/test/visual_check.html?stage=final
```

## 三、部署上线（GitHub Pages + DataPipe）

1. **建仓库**：把 `实验程序/` 整体推到一个 GitHub 仓库，Settings → Pages 选主分支根目录；
   得到地址如 `https://<user>.github.io/<repo>/index.html`。
2. **建 DataPipe 实验**：https://pipe.jspsych.org 用 OSF 账号登录 → New Experiment →
   记录 Experiment ID → 填入 `js/experiment.js` 的 `CONFIG.datapipe_experiment_id`。
   （也可自建：把 `analysis/dev_server.py` 部署到有 HTTPS 的服务器，
   `CONFIG.save_url` 指向其 `/save`。）
3. **平台接入**（Credamo / Prolific 通用）：
   - 发两条链接精确配平两臂：`.../index.html?id={平台ID占位}&arm=conflict&redirect={回跳}`
     与 `arm=control`（也可省略 arm 参数，程序按 id 哈希自动各半）；
   - 完成码：页面末屏展示（由 id+盐哈希），在平台后台核对；`redirect` 参数支持完成回跳；
   - 数据：DataPipe 后台按 sessionID 下载 JSON（P1/P2/P3/final 四个分块，防中途退出丢数）。
4. **软启动建议**：先导虽已跳过，仍建议先放 20–30 人，用 `validate_session.py` 抽检 +
   试次级质量指标（RT 分布、滑条使用、注意力检查通过率）确认后再放量。

## 四、数据字典（saveChunk 载荷）

顶层：`session, arm, part, when, elapsed_min, trials[], responses[], saves[]`。
`trials[]` 每试次：
`trial, phase(P1/P2/P3), arm, case_idx, industry, company, p, difficulty, y,
divergence(none/low/split/high), pure_number, minority, present[], combos{H:[x1,x2]},
advice{H:{name,a,text,combo,score}}, d_tilde, I, I_conf, rt_I, F, rt_F, advisor_map`。
`responses[]`（jsPsych 原始记录）：试次各屏（record_type=trial, part=initial/final/feedback）、
探针（probe）、量表（scale, point=1..3）、前测/后测（pretask/posttask）、
注意力检查（attention_check, ac_id=1/2）、理解检查（comprehension）、完成码（completion）。
分析与 `模拟/src/`（fit_model / fit_stats / recovery）语义对齐：p、y、a、I、F、
combos、d_tilde 字段即模拟管线的同名量。

## 五、版本与维护

- 材料变更 → 改 `实验材料/` 后重跑 `python build_stimuli.py`（重新编译 stimuli/*.js）；
  模板库版本以 `stimuli/templates.js` 的 TEMPLATE_VERSION 为准，与 `模拟/src/design.py` 同步。
- 排程/建议参数变更 → 改 `模拟/src/`（Python 真源）后重跑 build_stimuli + headless_test。
- **量表条目为 v0.9 候选**（questionnaires.js 文件头清单），预注册冻结前需文献核对
  （Mayer & Davis 1999 / MAILS / PFIS / Lipkus–Schwartz numeracy）。
- vendor/ 为 jsPsych 8.3.0 本地化，升级需回归测试。

## 六、已知边界

- 同一 id 重进得到同一排程（断点续做安全），但已保存数据不自动续答（平台重发新 id 处理）；
- 完成码为静态哈希（平台后台核对），非平台原生 token——Credamo 用"填验证码"题型对接；
- 强制休息按钮倒计时可被跳过者极少但存在（trial_duration 兜底）；
- 移动端拦截阈值 1100px 宽。
