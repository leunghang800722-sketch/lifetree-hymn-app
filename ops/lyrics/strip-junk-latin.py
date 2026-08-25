#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""47H 衝刺 b04(2026-08-16)——「拉丁垃圾行」過濾器,擺喺 dedupe 之後、閱讀之前。

點解要:`auditLyricsBatch.js` 用「拉丁字母 > CJK 字」判語言錯配,但好多中文歌嘅
draft 入面啲拉丁字母根本**唔係英文對照歌詞**,而係 OCR 逐幀認錯嘅 watermark /
頻道名 / 藝術字標題(例:基恩嘅「Amaang Grace Wortip」、Milk&Honey 嘅
「Milk&Hloney Worship」、讚美之泉兒童嘅拼音行)。dedupe-ocr-draft.py 個
BRAND_PAT 係 regex,認唔到俾 OCR 打爛咗嘅品牌字,所以呢啲歌會俾人當成「中英對照」
擺埋一邊,白白唔出街。

判法:一行**淨係拉丁字母冇 CJK**,而且入面**少過 2 個英文常用詞** → 當 OCR 垃圾。
真英文對照行(例 "Enter His gates with thanksgiving")一定夠 2 個常用詞,唔會誤殺。

用法:
  python3 ops/lyrics/strip-junk-latin.py <clean.json> <out.json> [--report]
"""
import json, re, sys

CJK = re.compile(r'[一-鿿㐀-䶿]')
LAT = re.compile(r'[A-Za-z]')
EN = set("""the you your my is are and of we to in for he his him her god lord me not with all that this
it be as on so from will can shall come our us they there when what who how i a an no more every day
life love heart name praise sing king was were has have do does did up down out over under new old
good great holy grace world let make made give given take mine yours am""".split())

def is_junk_latin(line):
    if not LAT.search(line) or CJK.search(line):
        return False
    toks = re.findall(r"[A-Za-z']+", line.lower())
    return sum(1 for t in toks if t in EN) < 2

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(2)
    src, dst = sys.argv[1], sys.argv[2]
    report = '--report' in sys.argv
    data = json.load(open(src))
    for x in data:
        keep = [l for l in x['lines'] if not is_junk_latin(l)]
        if report:
            print(f"{x['id']:6d} {len(x['lines']):4d} → {len(keep):4d}  {x['title'][:50]}")
        x['lines'] = keep
        x['uniq'] = len(keep)
    json.dump(data, open(dst, 'w'), ensure_ascii=False)
    print(f"{len(data)} 首 → {dst}")

if __name__ == '__main__':
    main()
