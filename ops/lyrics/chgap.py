#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""chgap —— 「CantonHymn 有、我哋庫冇」缺行掃描器(R2b 2026-08-25 造)。

同其他掃描器嘅分別:
  ・cardgap / gapscan2 / blockgap / shellscan 全部靠**自己條片嘅 OCR 幀**做錨,
    所以「條片根本冇燒字幕」或者「OCR 得幾幀」嗰批係結構上盲點。
  ・chgap 用 **cantonhymn.net 嘅【原曲】歌詞**做參照,完全唔使 OCR。
    佢答嘅係「呢首歌應該有幾多句」,唔係「條片邊個位有字」。

⚠️ 版權紅線(HANDOFF §2.0):cantonhymn 文字**只准核對**。呢個 script 只印
   「庫冇對應」嗰幾行嘅**位置同長度**加最多 6 個字嘅頭,唔會成段吐出嚟;
   要睇全文自己行 `cantonhymnLookup.js`,睇完唔准照抄 —— 一定要返去
   自己條片嘅 OCR / whisper 揾第二個證人先寫得入。

用法:
  python3 ops/lyrics/chgap.py 粵語:0                 # lang:parity
  python3 ops/lyrics/chgap.py 粵語:0 --status verified --minrun 2
  python3 ops/lyrics/chgap.py 粵語:0 --id 8858        # 單首
"""
import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BACKEND = os.path.join(ROOT, 'backend')
DB = os.path.join(BACKEND, 'hymns.db')
LOOKUP = os.path.join(BACKEND, 'scripts', 'cantonhymnLookup.js')
PRESCREEN = os.path.join(BACKEND, 'data', 'cantonhymn-prescreen.json')

# CH 歌詞入面嘅結構標籤,唔係歌詞
SECTION = re.compile(
    r'^\s*(verse|chorus|pre[\s-]?chorus|bridge|coda|intro|outro|refrain|tag|ending|interlude'
    r'|副歌|主歌|前奏|間奏|尾聲|過門|橋段)\s*\d*\s*[:：]?\s*$', re.I)
# CantonHymn「粵譯 + 國語原詞」雙層條目:國語嗰層唔屬於我哋首歌
LANG_TAG = re.compile(r'^\s*(粵語|國語|英文|Cantonese|Mandarin)\s*[:：]')
CJK = re.compile(r'[一-鿿]')


def norm(s):
    """比對用:剷標點空白、統一祢/袮→你、祂/佢→他,方便同 OCR 出身嘅庫行對數。"""
    s = re.sub(r'[\s　]', '', s)
    s = re.sub(r'[，,。.、！!？?；;：:「」『』（）()\[\]【】《》~～\-—…·’\'"“”*]', '', s)
    s = s.replace('祢', '你').replace('袮', '你').replace('儞', '你')
    s = s.replace('祂', '他').replace('佢', '他')
    return s


def lcs(a, b):
    """最長共同子序列長度(唔係子串 —— OCR 爛字會斬碎子串)。"""
    if not a or not b:
        return 0
    prev = [0] * (len(b) + 1)
    for ca in a:
        cur = [0]
        for j, cb in enumerate(b):
            cur.append(prev[j] + 1 if ca == cb else max(cur[j], prev[j + 1]))
        prev = cur
    return prev[-1]


def covered(cand, libs, pairs):
    """cand 呢句喺庫入面有冇對應?

    三關,任何一關過就當有:
      ① 同某條庫行 LCS / min(len) >= 0.75
      ② 同「庫相鄰兩行黐埋」LCS / len(cand) >= 0.8(庫成日將兩句併成一行,反之亦然)
      ③ cand 短(<=6 字)而且係某條庫行嘅子序列 —— 短行滑窗易假匹配,所以要求全中
    """
    n = len(cand)
    if n == 0:
        return True
    for l in libs:
        if not l:
            continue
        m = lcs(cand, l)
        if m / min(n, len(l)) >= 0.75:
            return True
    for p in pairs:
        if lcs(cand, p) / n >= 0.8:
            return True
    if n <= 6:
        for l in libs:
            if lcs(cand, l) == n:
                return True
    return False


# CantonHymn 有啲條目係「和弦譜」版,行入面夾住 [C] [F#m] [A/C#];
# 唔剷走就會令同一句歌詞對唔返庫,係本掃描器第二大假陽性(#4122 #3554 實錄)。
# ⚠️ 唔好寫得太窄:CantonHymn 啲和弦標記亂到 [Bm#] [F#m7-5] [A/C#] 都有,
# 第一版寫死咗「[A-G] 之後即刻要 #/b」就漏咗 [Bm#],剩返嘅噪音仲有成兩成。
CHORD = re.compile(r'\[[A-G][A-Za-z0-9#b/+\-]{0,7}\]')


def ch_lines(raw):
    out = []
    for ln in re.split(r'[\r\n]+', raw or ''):
        ln = CHORD.sub('', ln).strip()
        ln = re.sub(r'\s{2,}', ' ', ln).strip()
        if not ln or SECTION.match(ln):
            continue
        if LANG_TAG.match(ln):
            tag = LANG_TAG.match(ln).group(1)
            if tag not in ('粵語', 'Cantonese'):
                continue                      # 國語/英文層 —— 唔屬於呢首粵語歌
            ln = LANG_TAG.sub('', ln).strip()
        if len(CJK.findall(ln)) < 2:
            continue                          # 純英文行 / 和弦殘留
        out.append(ln)
    return out


def lookup(title):
    try:
        r = subprocess.run(['node', LOOKUP, title, '--json', '--limit', '4'],
                           cwd=BACKEND, capture_output=True, text=True, timeout=120)
        return json.loads(r.stdout) if r.stdout.strip().startswith('{') else None
    except Exception:
        return None


def zh_title(t):
    t = re.match(r'^[^A-Za-z]*', t or '').group(0)
    return re.sub(r'[\s《》【】()（）\[\]]', '', t).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('part', help='lang:parity,例 粵語:0')
    ap.add_argument('--status', default='verified')
    ap.add_argument('--minrun', type=int, default=2, help='連續幾多行庫冇對應先報(單行多數係併行)')
    ap.add_argument('--id', type=int, default=None)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--mincov', type=float, default=0.35,
                    help='CH 行有幾多成對得返庫先當係同一首歌(低過就當同名不同曲)')
    ap.add_argument('--showdiff', action='store_true', help='印埋俾覆蓋率閘篩走嗰啲')
    ap.add_argument('--reverse', action='store_true',
                    help='反方向:報「庫有但 CH 冇」—— 捉經文卡/跨歌污染/擺錯譯本')
    ap.add_argument('--nopre', action='store_true',
                    help='唔用 cantonhymn-prescreen.json 過濾 —— 預篩檔係舊日生成,新入庫嘅歌唔喺入面')
    a = ap.parse_args()
    lang, parity = a.part.split(':')
    parity = int(parity)

    hits = set(json.load(open(PRESCREEN))['hits'].keys())
    con = sqlite3.connect('file:%s?mode=ro' % DB, uri=True)
    rows = con.execute(
        "SELECT id,title,artist,lyrics FROM hymns_all "
        "WHERE lang=? AND id%2=? AND lyrics_status=? AND lyrics IS NOT NULL AND lyrics<>''",
        (lang, parity, a.status)).fetchall()
    if a.id:
        rows = [r for r in rows if r[0] == a.id]
    elif not a.nopre:
        rows = [r for r in rows if str(r[0]) in hits]
    if a.limit:
        rows = rows[:a.limit]
    print('掃 %d 首(%s id%%2=%d status=%s,有 prescreen 底本)' % (len(rows), lang, parity, a.status),
          file=sys.stderr)

    reported = 0
    for idx, (sid, title, artist, lyr) in enumerate(rows):
        zt = zh_title(title)
        if len(zt) < 2:
            continue
        res = lookup(zt)
        if not res or not res.get('results'):
            continue
        cand = None
        for r in res['results']:
            m = r.get('match') or {}
            cs = r.get('currentSong') or {}
            if norm(m.get('title', '')) == norm(zt) and cs.get('lyrics'):
                cand = cs
                break
        if not cand:
            continue
        chl = ch_lines(cand['lyrics'])
        if len(chl) < 4:
            continue
        libs = [norm(x) for x in re.split(r'[\r\n]+', lyr) if norm(x)]
        pairs = [libs[i] + libs[i + 1] for i in range(len(libs) - 1)]
        pairs += [libs[i] + libs[i + 1] + libs[i + 2] for i in range(len(libs) - 2)]

        # --reverse:兩邊掉轉,用 CH 做「應該有嘅全集」,揾庫入面多出嚟嗰啲
        if a.reverse:
            chn = [norm(x) for x in chl]
            chpairs = [chn[i] + chn[i + 1] for i in range(len(chn) - 1)]
            chpairs += [chn[i] + chn[i + 1] + chn[i + 2] for i in range(len(chn) - 2)]
            src, tgt, tgtpairs = [x for x in re.split(r'[\r\n]+', lyr) if norm(x)], chn, chpairs
        else:
            src, tgt, tgtpairs = chl, libs, pairs

        run, runs, hitn = [], [], 0
        for ln in src:
            n = norm(ln)
            if covered(n, tgt, tgtpairs):
                hitn += 1
                if len(run) >= a.minrun:
                    runs.append(run)
                run = []
            else:
                run.append(ln)
        if len(run) >= a.minrun:
            runs.append(run)
        if not runs:
            continue
        # 🔑 覆蓋率閘:CH 條目同我哋首歌對唔到一半 = 同名唔同曲(例 #30《恩典夠用》
        #    角聲使團 vs CH 收嘅泥土音樂版),唔係我哋寫漏。呢個係本掃描器頭號假陽性。
        cov = hitn / max(1, len(src))
        if cov < a.mincov:
            if a.showdiff:
                print('   (skip #%d cov=%.2f 疑似同名不同曲)' % (sid, cov), file=sys.stderr)
            continue
        reported += 1
        print('\n#%d 《%s》 | %s | 庫%d行 / CH%d行 cov=%.2f | %s'
              % (sid, title[:32], (artist or '')[:16], len(libs), len(chl), cov,
                 (cand.get('source') or cand.get('person') or '')[:24]))
        for run in runs:
            print('   ▸ 連續 %d 行%s:' % (len(run), 'CH 冇對應(庫可能寫多咗)' if a.reverse else '庫冇對應'),
                  ' / '.join('%s…(%d字)' % (x[:6], len(x)) for x in run))
    print('\n報咗 %d 首(掃 %d)' % (reported, len(rows)), file=sys.stderr)


if __name__ == '__main__':
    main()
