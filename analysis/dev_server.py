"""dev_server.py — 本地开发/兜底数据服务器（stdlib，无依赖）

- 静态托管实验程序目录（ http://localhost:8787/index.html?id=... ）；
- POST /save 接收 saveChunk 载荷，写入 sessions/<session>-<part>.json；
- GET /sessions 列出已收文件（JSON）。

用法：python dev_server.py [--port 8787]
在 js/experiment.js 的 CONFIG.save_url 填 "http://localhost:8787/save" 即可本地收数。
"""

from __future__ import annotations

import argparse
import http.server
import json
import os
import re
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "..")
SESS = os.path.join(ROOT, "sessions")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):  # 静默常规访问日志
        pass

    def do_POST(self):
        if self.path != "/save":
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            self.send_error(400, f"bad json: {e}")
            return
        sid = re.sub(r"[^A-Za-z0-9_\-]", "_", str(payload.get("session", "anon")))
        part = re.sub(r"[^A-Za-z0-9_\-]", "_", str(payload.get("part", "x")))
        os.makedirs(SESS, exist_ok=True)
        path = os.path.join(SESS, f"{sid}-{part}.json")
        # 原子写入（临时文件 + 改名），防并发/中断产生半截文件
        tmp = path + f".tmp-{os.getpid()}"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        os.replace(tmp, path)
        print(f"[{time.strftime('%H:%M:%S')}] 已保存 {path} "
              f"（试次 {len(payload.get('trials', []))}）")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b'{"ok": true}')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/sessions":
            files = sorted(os.listdir(SESS)) if os.path.isdir(SESS) else []
            body = json.dumps(files, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    args = ap.parse_args()
    os.makedirs(SESS, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"实验地址: http://localhost:{args.port}/index.html?id=测试01")
    print(f"保存端点: http://localhost:{args.port}/save  →  {SESS}/")
    srv.serve_forever()


if __name__ == "__main__":
    main()
