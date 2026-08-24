#!/usr/bin/env python3
# paddleframe.py —— LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P1:中文歌 OCR 主引擎(PaddleOCR)。
#
# 點解唔繼續用 macOS Vision(ocrframe.swift):2026-08-16 實測(id 4228 讚美之泉
# 兒童舞蹈版,黃色圓體藝術字),Vision 喺 360p/720p/裁剪放大全部讀錯(「慈愛和
# 機間 是天父的心踢」),PaddleOCR chinese_cht 連 360p 都 1.00 信心分全對
# (「慈愛和憐憫 是天父的心腸」)。英文歌照舊行 Vision(夠準、唔使開 python)。
#
# 用法:paddle-venv/bin/python paddleframe.py <frame1.png> [frame2.png ...]
#   一次過餵晒成首歌嘅 frame(model 載入要 ~5 秒,逐張叫就嘥晒)。
# 輸出:stdout 一個 JSON array,每張 frame 一個元素(次序 = argv 次序):
#   { "file": "...", "lines": [ { "text": "...", "score": 0.98,
#       "box": [x0,y0,x1,y1](normalize 做 0-1,y 由上到下) } ] }
#   行次序 = 畫面由上到下(按 box y 中心排)。
#   讀唔到/出錯嘅 frame → lines=[](唔阻其他 frame,同 ocrframe exit 1 嘅精神一致)。
#
# 環境(唔好郁):
#   * venv 喺 backend/tools/paddle-venv,用 **系統 /usr/bin/python3(3.9)** 建 ——
#     homebrew 得 3.14,paddlepaddle 冇 3.14 wheel(2026-08-16 實測裝唔到)。
#   * 版本 pin 死 paddlepaddle==3.3.1 paddleocr==3.7.0(scratchpad 實測組合)。
#   * 重裝:/usr/bin/python3 -m venv paddle-venv &&
#          paddle-venv/bin/pip install "paddlepaddle==3.3.1" "paddleocr==3.7.0"
#   * 模型 cache 喺 ~/.paddlex(首跑自動下載 ~30MB,之後離線)。
#   * venv 唔入 git(見 backend/tools/.gitignore)。

import json
import sys
import os
import subprocess

# paddle 嘅 C++ 層會向 stdout/stderr 噴 log,污染 JSON 輸出 —— 全部收聲。
os.environ.setdefault("GLOG_minloglevel", "3")
os.environ.setdefault("FLAGS_minloglevel", "3")


# ── BLAS 線程上限(2026-08-24「Python 未預期的結束」彈窗根因)─────────────
# 2026-08-17 → 08-22 部 backend Mac 出咗 26 個一模一樣嘅 Python crash report,
# 堆疊全部係:PaddleOCR conv → phi::funcs::Blas::GEMM → cblas_sgemm →
# libBLAS.dylib(Apple Accelerate,行 dispatch_apply 並行)→ SIGSEGV。
# 唔係 OOM、唔係俾人 kill:fetchLyrics.js 開 --ocr-concurrency 條 OCR 線,每條線
# 一個 paddle process,而每個 process 嘅 Accelerate 都各自向**全部**核開 thread
# (10 核機 = 2×10 條 BLAS thread 搶 10 個核),oversubscribe 到 Accelerate 內部爆。
# 爆完 fetchLyrics.js 會靜靜 fallback 去 Vision —— job 唔會停、唔使人手救,但嗰
# 首歌就落咗去讀藝術字體最差嗰個引擎(正正係當初轉 Paddle 嘅原因),所以要根治。
#
# ⚠️ 呢啲 env **一定要喺 import numpy/paddle 之前設**(Accelerate 開機讀一次就
# 定死),所以擺喺 module 頂,唔可以搬落 main() 嗰段 import 後面。
def _thread_cap():
    env = (os.environ.get("PADDLE_CPU_THREADS") or "").strip()
    if env.isdigit() and int(env) > 0:
        return int(env)
    # 冇人指定 → 效能核一半兜底(正路由 fetchLyrics.js 計「效能核 ÷ 並行線」傳落嚟)
    try:
        perf = int(subprocess.check_output(["sysctl", "-n", "hw.perflevel0.logicalcpu"]))
    except Exception:
        perf = os.cpu_count() or 4
    return max(1, perf // 2)


# 只郁 VECLIB_MAXIMUM_THREADS(Accelerate/vecLib,即係爆嗰個)。OMP_NUM_THREADS
# 唔好掂:paddle 自己管 OpenMP,你一設佢就喺 stderr 嘈「set to N, not 1」,而且
# OpenMP 唔係 crash 現場;paddle 自己嗰個 pool 用下面 cpu_threads 夾。
PADDLE_THREADS = _thread_cap()
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", str(PADDLE_THREADS))

def main():
    frames = sys.argv[1:]
    if not frames:
        print("用法:paddleframe.py <frame1.png> [frame2.png ...]", file=sys.stderr)
        sys.exit(2)

    # import 放 main 入面:--help 之類唔使等 5 秒 model 載入
    import logging
    logging.disable(logging.CRITICAL)
    from paddleocr import PaddleOCR

    # chinese_cht:繁體主力(粵語/國語詩歌 MV 大多數繁體;簡體字幕實測都認到大部分,
    # 認唔到嗰啲 fetchLyrics.js 有 Vision fallback 兜底)。三個 doc-級前處理全部熄:
    # 字幕 frame 唔會歪/唔會係文檔,熄咗慳一截時間。
    # cpu_threads:paddle 自己嗰個 intra-op thread pool,同上面啲 env(Accelerate/
    # OMP)一齊夾死,先至真係唔會兩個 process 各自食晒 10 個核。
    ocr = PaddleOCR(
        lang="chinese_cht",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        cpu_threads=PADDLE_THREADS,
    )

    # 連續 frame 去重(2026-08-17 24h 追趕加):歌詞 MV 好多時成十秒畫面完全唔郁,
    # 每 2 秒抽一張 frame 就有大量一模一樣嘅 frame。用 64x36 灰階縮圖比較,直接
    # 翻用上一張嘅 OCR 結果(semantics 一樣:同一版字幕讀出嚟本來就同一堆行)。
    # ⚠️ 量度一定要用**分區最大差**唔可以用全幅平均差 —— 合成測試實錘:字幕
    # 只佔畫面一細撻,全幅平均會被唔郁嘅背景溝淡到 <1,字幕轉咗都察覺唔到。
    # 做法:縮圖切 8x6=48 個 block,逐 block 計平均差,攞最大嗰個;局部變化
    # (字幕轉行)一定頂爆自己嗰幾個 block,背景壓縮雜訊就全域都細。
    # 縮圖 128x72:試過 64x36,細字幕(有啲 MV 字幕得畫面高度 5%)縮完得 1-2px,
    # 訊號冇晒;128x72 之下 5% 高度都仲有 3-4px,block 度量捉得到。
    import PIL.Image
    DEDUP_BLOCK_THRESHOLD = 6.0
    THUMB_W, THUMB_H = 128, 72

    def max_block_diff(a, b, w=THUMB_W, h=THUMB_H, bw=8, bh=6):
        worst = 0.0
        for by in range(0, h, bh):
            for bx in range(0, w, bw):
                s = 0
                for y in range(by, by + bh):
                    row = y * w
                    for x in range(bx, bx + bw):
                        s += abs(a[row + x] - b[row + x])
                d = s / (bw * bh)
                if d > worst:
                    worst = d
        return worst

    out = []
    prev_thumb = None
    prev_lines = None
    reused = 0
    for f in frames:
        entry = {"file": f, "lines": []}
        w = h = None
        thumb = None
        try:
            with PIL.Image.open(f) as im:
                w, h = im.size
                thumb = list(im.convert("L").resize((THUMB_W, THUMB_H)).getdata())
        except Exception as e:
            print(f"frame 讀唔到({f}):{e}", file=sys.stderr)
            out.append(entry)
            continue

        if prev_thumb is not None and thumb is not None:
            if max_block_diff(thumb, prev_thumb) < DEDUP_BLOCK_THRESHOLD and prev_lines is not None:
                entry["lines"] = prev_lines
                out.append(entry)
                prev_thumb = thumb
                reused += 1
                continue

        try:
            for res in ocr.predict(f):
                texts = res.get("rec_texts") or []
                scores = res.get("rec_scores") or []
                boxes = res.get("rec_boxes")
                boxes = boxes.tolist() if boxes is not None and hasattr(boxes, "tolist") else (boxes or [])
                lines = []
                for i, t in enumerate(texts):
                    line = {"text": t, "score": float(scores[i]) if i < len(scores) else None}
                    if i < len(boxes) and w and h:
                        x0, y0, x1, y1 = boxes[i]
                        line["box"] = [round(x0 / w, 4), round(y0 / h, 4), round(x1 / w, 4), round(y1 / h, 4)]
                    lines.append(line)
                # 畫面由上到下排(同 ocrframe.swift 一致,mergeOcrLines 靠呢個次序)
                lines.sort(key=lambda l: (l.get("box") or [0, 0])[1])
                entry["lines"] = lines
        except Exception as e:
            print(f"frame 讀唔到({f}):{e}", file=sys.stderr)
        out.append(entry)
        prev_thumb = thumb
        prev_lines = entry["lines"]

    print(f"dedup:翻用 {reused}/{len(frames)} 張 frame", file=sys.stderr)
    json.dump(out, sys.stdout, ensure_ascii=False)

if __name__ == "__main__":
    main()
