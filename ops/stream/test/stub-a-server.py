#!/usr/bin/env python3
# 測試用:127.0.0.1 隨機 port,對 GET /api/stream/<id> 回 206(模擬 backend Layer A 健康);第一行 stdout 印 port。自己起自己殺。
import http.server, socketserver, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(206); self.send_header('Content-Length', '4'); self.end_headers(); self.wfile.write(b'abcd')
    def log_message(self, *a): pass
with socketserver.TCPServer(('127.0.0.1', 0), H) as s:
    print(s.server_address[1], flush=True); s.serve_forever()
