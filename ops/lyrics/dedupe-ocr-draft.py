#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""47H 衝刺 b01:OCR 逐幀 draft 去重前處理。
輸出每首歌一段「unique 內容行(保留首次出現次序)」,俾人手最後定稿。
唔會寫 DB,純粹係閱讀用嘅壓縮視圖。"""
import json, re, sys, unicodedata

CJK = re.compile(r'[一-鿿]')
# credit / branding / UI 行
CREDIT_PAT = re.compile(
    r'(詞曲|作詞|作曲|編曲|監製|製作人?|演唱|主唱|和聲|混音|母帶|錄音|吉他|鍵盤|貝斯|鼓|導演|攝影|剪接|後期|美術|版權|發行|出品|策劃|統籌|翻譯|填詞|原曲|原唱|曲[：:]|詞[：:]|經文摘編|經文編寫|經文改編)'
    r'|(?i:copyright|all rights reserved|words?\s*(&|and)\s*music|music\s*(&|and)\s*words?|composed by|written by|lyrics? by|arranged by|produced by|℗|©)'
)
BRAND_PAT = re.compile(
    r'(官方(歌詞)?(MV|MV版|版)?|歌詞MV|Official|Lyric Video|Lyrics Video|MV|訂閱|Subscribe|頻道|YouTube|facebook|Instagram|www\.|https?://|\.com|\.org|\.net'
    r'|收錄(在|於)|專輯|EP|唱片|版權所有|翻印必究|請勿(轉載|翻錄)|歡迎(分享|奉獻)|奉獻支持|更多資訊)'
)
# 純 OCR 噪音:冇 CJK 而且太短 / 全符號 / 已知碎片
NOISE_EXACT = set('''= == === =- -= _ __ 几 二 三 口 _口 aanw MU Mu Mu。 MuB MuBe MUBID Musle MusIe Mw Mus mus MUS
1-01 =-3= =13 =-口 二L o O 0 x X . .. ... ,'''.split())
NOISE_PAT = re.compile(r'^[\W\d_]*$')

def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = s.replace('　', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def keyof(s):
    """去重用嘅 key:剷走所有非字母數字 CJK,方便 OCR 小差異撞埋一齊"""
    return re.sub(r'[^\w一-鿿]', '', s).lower()

def is_junk(line):
    t = line.strip()
    if not t: return True
    if t in NOISE_EXACT: return True
    if NOISE_PAT.match(t): return True
    if CREDIT_PAT.search(t): return True
    if BRAND_PAT.search(t): return True
    n_cjk = len(CJK.findall(t))
    # 冇中文:太短嘅拉丁碎片當噪音(英文歌會另外處理)
    if n_cjk == 0:
        letters = re.sub(r'[^A-Za-z ]', '', t)
        if len(letters.replace(' ', '')) < 4: return True
    else:
        if n_cjk <= 1 and len(t) <= 3: return True
    return False

def clean(draft, lang):
    out, seen = [], {}
    for raw in draft.split('\n'):
        t = norm(raw)
        if is_junk(t):
            continue
        k = keyof(t)
        if not k:
            continue
        if k in seen:
            seen[k] += 1
            continue
        seen[k] = 1
        out.append(t)
    return out, seen

def main():
    src, out_path = sys.argv[1], sys.argv[2]
    only = set(int(x) for x in sys.argv[3].split(',')) if len(sys.argv) > 3 and sys.argv[3] != 'all' else None
    langs = set(sys.argv[4].split(',')) if len(sys.argv) > 4 else None
    data = json.load(open(src))
    res = []
    for s in data:
        if only and s['id'] not in only: continue
        if langs and s.get('lang') not in langs: continue
        lines, seen = clean(s.get('draft') or '', s.get('lang'))
        res.append({'id': s['id'], 'title': s['title'], 'artist': s['artist'],
                    'lang': s['lang'], 'source': s['source'],
                    'raw_lines': len((s.get('draft') or '').split('\n')),
                    'uniq': len(lines),
                    'chars': sum(len(x) for x in lines),
                    'lines': lines,
                    'reps': {l: seen[keyof(l)] for l in lines}})
    json.dump(res, open(out_path, 'w'), ensure_ascii=False, indent=1)
    print(f'{len(res)} 首 → {out_path}')

main()
