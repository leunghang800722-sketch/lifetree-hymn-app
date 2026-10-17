#!/usr/bin/env python3
# R1b 國語雙數線 2026-08-25 出品 ——「片頭標題卡抄咗做庫第 1 行」通用版偵測器。
#
# 🔴 由來:同日 R1 出嘅 `prefixcard` 捉到 8 首,但佢第 ① 條判準要求
#   「庫入面另有一條行 Y **以** X **開頭**」。實測 #8528《神的家》(泥土音樂)漏網 ——
#   因為「神的家」喺庫入面係「神的兒女真有福 進入神的家」嘅**尾**,唔係頭。
#   即係話 prefixcard 結構上淨係捉到「標題 = 某句歌詞前綴」嗰半,
#   「標題喺句中/句尾」嗰半(中文歌名好常見)全部走甩。
#
# 判準(四條全部要成立,唔再要求前綴關係):
#   ① 庫第 1 行 L1 係 2–10 個中文字嘅短行(唔可以有空格分句);
#   ② L1 對得返歌名主幹(去晒【】()、英文、頻道名、專輯尾巴之後);
#   ③ L1 **冇**喺歌唱段(t 喺 MARGIN 秒之後、dur-MARGIN 秒之前)獨立成一行出現過;
#   ④ L1 有喺片頭 / 片尾嘅 OCR 幀出現過(即係真係有張卡);
#   ⑤ 🔑 **排版指紋**:L1 之後即刻係空行,或者係「一行英文標題 + 空行」。
#      冇咗呢條就會誤報「歌名 = 歌詞第一句」嗰種(詩篇類最多:#6386《耶和華是我牧者》、
#      #8228《你們要讚美耶和華》、#8154《一粒麥子》第 2 行直接跟落去就係第 2 句歌詞)。
#      標題卡抄落庫嗰陣 producer 一定會留一個空行分隔,呢個係最硬嘅結構證據。
#
# ⚠️ 判準 ③ 用「獨立成行」而唔係「出現過」:歌名做副歌 hook(例:#7552《跳舞》
#   副歌真係唱「跳舞 / DANCE」)嗰陣一定會有獨立幀,咁就自動唔報。
#
# 用法: python3 ops/lyrics/titlecard.py [lang:parity] [margin=40]
import json,sqlite3,re,sys
DB='/Users/macbookpro/.openclaw/workspace/hymn-app/backend/hymns.db'
arg=sys.argv[1] if len(sys.argv)>1 else '國語:0'
lang,par=arg.split(':'); par=int(par)
MARGIN=int(sys.argv[2]) if len(sys.argv)>2 else 40
CJK=r'[一-鿿]'
def cjk(s): return ''.join(re.findall(CJK,s or ''))
def stem(title):
    t=title or ''
    t=re.sub(r'[【】\[\]()（）]',' ',t)
    t=re.sub(r'[A-Za-z0-9,.:;!?\'"&/\-_|·’]+',' ',t)
    return [x for x in re.split(r'\s+',t) if x]
def dur_s(d):
    if not d: return None
    p=d.split(':')
    try: return int(p[0])*60+int(p[1]) if len(p)==2 else None
    except: return None
con=sqlite3.connect('file:'+DB+'?mode=ro',uri=True)
rows=con.execute("SELECT id,title,artist,duration,lyrics,lyrics_timeline FROM hymns_all WHERE lang=? AND lyrics_status='verified' AND lyrics IS NOT NULL AND lyrics_timeline IS NOT NULL",(lang,)).fetchall()
n=0; hit=0
for r in rows:
    if r[0]%2!=par: continue
    n+=1
    lines=[l.strip() for l in (r[4] or '').split('\n')]
    if not lines: continue
    L1=lines[0]
    if not L1 or ' ' in L1 or '　' in L1: continue
    c=cjk(L1)
    if len(c)<2 or len(c)>10 or len(c)!=len(L1): continue
    # ② 對得返歌名主幹
    st=stem(r[1])
    if not any(L1==s or (L1 in s and len(L1)>=2) for s in st): continue
    t=json.loads(r[5]); ocr=t.get('ocr') or []
    if not ocr: continue
    D=dur_s(r[3]) or (max(f.get('t',0) for f in ocr)+10)
    solo_sing=[]; card=[]
    for f in ocr:
        tt=f.get('t',0)
        for ln in (f.get('text') or '').split('\n'):
            ln=ln.strip()
            if ln==L1:
                if MARGIN<=tt<=D-MARGIN: solo_sing.append(tt)
                else: card.append(tt)
        if L1 in (f.get('text') or '') and (tt<MARGIN or tt>D-MARGIN): card.append(tt)
    if solo_sing: continue          # ③
    if not card: continue           # ④
    # ⑤ 排版指紋:L1 之後 = 空行,或者「英文標題 + 空行」
    nxt=lines[1] if len(lines)>1 else ''
    drop=1
    if nxt and not cjk(nxt) and re.search(r'[A-Za-z]',nxt):
        nxt2=lines[2] if len(lines)>2 else ''
        if nxt2.strip(): continue
        drop=2
    elif nxt.strip():
        continue
    hit+=1
    print(f"#{r[0]} {r[2]} | {r[1][:56]} [庫{len([x for x in lines if x])}行 dur {r[3]}]")
    print(f"   🃏 庫第1行「{L1}」 只喺片頭/尾幀出現 t={','.join(str(x) for x in sorted(set(card))[:6])}")
    print(f"      剷 {drop} 行 | 之後第一句: {next((l for l in lines[drop:] if l.strip()),'')}")
print(f"掃 {n} 首 → 命中 {hit} 首")
