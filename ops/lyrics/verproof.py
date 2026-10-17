#!/usr/bin/env python3
# R2 粵語單數線 2026-08-25 出品 ——「庫版本同條片對唔上」掃描器。
#
# 由來:#3803《與你一起》verified,但庫入面擺咗嘅係同一首曲**另一個粵詞版本**
#   (CantonHymn 唐頌恩譯本),條片實際唱緊 SON Music 譯本。條片 OCR 幀數 = 0,
#   所有靠「OCR 幀錨定」嘅掃描器(cardgap / blockgap / titlemiss / sandwich…)
#   結構上完全見唔到佢。
#
# 判準:攞條片自己嘅 whisper 攤平做一條長字串,逐條庫行計 SequenceMatcher
#   匹配覆蓋率(matched / len(line))。**自己條庫應該高分**;低分就代表
#   「條片唱緊嘅嘢同庫寫住嘅唔係同一份文本」。
#   再喺全庫(同 lang)揾有冇第二首歌對得更加好 → 就係「應該係嗰個版本」。
#
# ⚠️ 唔好用逐行 exact / LCS:兩個粵譯版本共用大量常用字(你我主愛一生),
#   逐字比會兩邊都高分。SequenceMatcher 嘅「有序匹配塊總和」對版本差異敏感好多。
# ⚠️ whisper 幻覺行(詞曲:張震嶽 / 詞曲 李宗盛 / 純標點)要先剷,唔係會拉低分數。
#
# 用法: python3 ops/lyrics/verproof.py [lang:parity] [thresh=0.62]
import sqlite3, re, sys, json
from difflib import SequenceMatcher

DB = "/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db"
lang, par = (sys.argv[1] if len(sys.argv) > 1 else "粵語:1").split(":")
par = int(par)
THRESH = float(sys.argv[2]) if len(sys.argv) > 2 else 0.62

HALLU = re.compile(r'張震嶽|李宗盛|周杰倫|詞曲[:：]|字幕由|請不吝|訂閱|點贊|明鏡與點點欄目')
def norm(s):
    s = re.sub(r'[祢禰袮称祂衪妳她它]', '你', s)
    s = re.sub(r'[着著]', '著', s)
    return re.sub(r'[^一-鿿]', '', s)

def cover(lines, flat):
    out = []
    for L in lines:
        m = SequenceMatcher(None, L, flat, autojunk=False)
        out.append(sum(b.size for b in m.get_matching_blocks()) / len(L))
    return out

con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True)
rows = con.execute("SELECT id,lang,title,lyrics,lyrics_timeline FROM hymns_all "
                   "WHERE lyrics_status='verified' AND lyrics IS NOT NULL").fetchall()
lib = {}
for i, lg, t, ly, tl in rows:
    ls = [norm(x) for x in ly.split('\n')]
    ls = [x for x in ls if len(x) >= 4]
    if ls: lib[i] = (lg, t, ls)

hits = []
for i, lg, t, ly, tl in rows:
    if lg != lang or i % 2 != par or i not in lib: continue
    try: tj = json.loads(tl or '{}')
    except Exception: continue
    W = tj.get('whisper') or []
    if not isinstance(W, list) or len(W) < 8: continue
    segs = [w.get('text', '') for w in W if not HALLU.search(str(w.get('text', '')))]
    flat = norm(''.join(segs))
    if len(flat) < 60: continue
    lines = lib[i][2]
    if len(lines) < 4: continue
    sc = cover(lines, flat)
    mine = sum(sc) / len(sc)
    if mine >= THRESH: continue
    # 揾有冇第二首歌對得更好(同 lang、行數 ≥4、唔係自己)
    best = None
    for j, (lg2, t2, ls2) in lib.items():
        if j == i or lg2 != lang: continue
        # 快速預篩:至少一條行係 flat 嘅子串
        if not any(x in flat for x in ls2 if len(x) >= 5): continue
        s2 = cover(ls2, flat); m2 = sum(s2) / len(s2)
        if best is None or m2 > best[1]: best = (j, m2, t2, len(ls2))
    hits.append((i, t, mine, len(lines), best))

hits.sort(key=lambda h: h[2])
ONLY = __import__('os').environ.get('ONLY')
for i, t, mine, n, best in hits:
    flag = ''
    if best and best[1] > mine + 0.10: flag = "  🚨 有更啱嘅版本"
    if ONLY and not flag: continue
    print(f"#{i} 自己覆蓋={mine:.3f} 庫{n}行 | {t[:52]}{flag}")
    if best:
        print(f"      ↳ 最佳對手 #{best[0]} 覆蓋={best[1]:.3f} ({best[3]}行) {best[2][:52]}")
print(f"掃 {sum(1 for i,lg,t,ly,tl in rows if lg==lang and i%2==par)} 首 → 低分 {len(hits)} 首(門檻 {THRESH})")
