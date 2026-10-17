#!/usr/bin/env python3
# ops/stream/stream-botcheck-count.py <backend.log> [minutes=30] [--now <epoch>]
# STREAM-PHONE-NOTIFY-EXEC-20261015 R1:數 backend log 最近 N 分鐘內「出口 IP 被 YouTube bot-check」嘅證據行數(純只讀,印一個整數)。
#
# 證據行 = 命中 `Sign in to confirm you.{1,3}re not a bot` | `LOGIN_REQUIRED` | `bot-check 偵測到`。
#   ⚠️ 撇號係 yt-dlp 印嘅 U+2019(UTF-8 三 byte),LANG=C 下 `.` 只食一 byte ⇒ 用 `.{1,3}`(事故 log 實測係 ’)。
# ⚠️ bot-check 行本身冇時間戳。時間錨 = 同 log 入面帶 ISO-Z 時間嘅 `[tag] 2026-..T..Z` 行(stream/hls/pin/warm…,
#   healthcheck 每 30 分鐘打 /api/stream 一定有)。保守估計:一行嘅時間 >= 佢之前最近一個錨 ⇒
#   只有「前一個錨 >= now-N分鐘」嘅證據行先算(寧可少數都唔好將舊事故殘留當而家:log 係累積檔,10-14 事故行仲喺度)。
#   檔案頭之前冇錨 / 錨全部太舊 → 0。讀唔到檔 → 0(= 當冇證據,維持舊行為)。
import re, sys, os, datetime

def main():
    args = sys.argv[1:]
    now = None
    if '--now' in args:
        i = args.index('--now'); now = float(args[i + 1]); del args[i:i + 2]
    if not args: print(0); return
    path = args[0]; mins = float(args[1]) if len(args) > 1 else 30.0
    if now is None: now = datetime.datetime.now(datetime.timezone.utc).timestamp()
    cut = now - mins * 60
    try:
        size = os.path.getsize(path)
        with open(path, 'rb') as f:
            if size > 8_000_000: f.seek(size - 8_000_000)   # 只讀尾 8MB,夠覆蓋任何 30 分鐘窗
            raw = f.read().decode('utf-8', errors='replace')
    except Exception:
        print(0); return
    anchor = re.compile(r'^\[[A-Za-z]+\] (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)')
    ev = re.compile(r"Sign in to confirm you.{1,3}re not a bot|LOGIN_REQUIRED|bot-check 偵測到")
    prev = None; n = 0
    for line in raw.splitlines():
        m = anchor.match(line)
        if m:
            try: prev = datetime.datetime.fromisoformat(m.group(1).replace('Z', '+00:00')).timestamp()
            except Exception: pass
            continue
        if prev is not None and prev >= cut and prev <= now + 300 and ev.search(line):
            n += 1
    print(n)
main()
