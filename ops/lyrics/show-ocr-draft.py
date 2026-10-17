#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""47H 衝刺 b03:dedupe 之後嘅「人手閱讀視圖」,再加一層子串抑制。

背景:`dedupe-ocr-draft.py` 已經按「去標點小寫化」做咗去重,但 OCR 逐幀切字仲會留低大量
「出現一次、而且係另一條較長行嘅子串」嘅碎片(例:長行「我仍要宣告 祢是我的倚靠」旁邊
會有「我仍要宣」「祢是我的」「倚靠」),同心圓/ACM 嗰類 u=200+ 嘅 draft 大半都係呢啲。
呢個 script 淨係「唔顯示」佢哋(唔會改檔、唔會寫 DB),實測閱讀量再減三至四成。

用法:
  python3 ops/lyrics/dedupe-ocr-draft.py <drafts.json> <clean.json> all [國語,粵語]
  python3 ops/lyrics/show-ocr-draft.py   <clean.json> <start> <end>

輸出每行前面個 [n] 係「呢句喺原始 draft 出現咗幾多次」——重複多嘅通常就係真歌詞行,
出現一次嘅多數係 OCR 認錯字嘅變體,兩者夾埋睇最快分到邊句先係正版。
"""
import json, sys, re

def key(s):
    return re.sub(r'[^\w一-鿿]', '', s).lower()

def main():
    if len(sys.argv) < 4:
        print(__doc__); sys.exit(2)
    f, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    d = json.load(open(f))
    for x in d[a:b]:
        print(f"===== id={x['id']} | {x['artist']} | {x['lang']} | raw{x['raw_lines']}→u{x['uniq']}")
        print(x['title'])
        lines = x['lines']
        keys = [key(l) for l in lines]
        kept = 0
        for i, l in enumerate(lines):
            k = keys[i]
            if len(k) < 2:
                continue
            # 出現一次、而且係另一條較長行嘅子串 → 典型 OCR 碎片,跳過
            if x['reps'].get(l, 1) == 1 and any(
                    j != i and len(keys[j]) > len(k) and k in keys[j] for j in range(len(lines))):
                continue
            print(f"  [{x['reps'].get(l, 1)}] {l}")
            kept += 1
        print(f"  (顯示 {kept}/{len(lines)})\n")

if __name__ == '__main__':
    main()
