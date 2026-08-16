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

# paddle 嘅 C++ 層會向 stdout/stderr 噴 log,污染 JSON 輸出 —— 全部收聲。
os.environ.setdefault("GLOG_minloglevel", "3")
os.environ.setdefault("FLAGS_minloglevel", "3")

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
    ocr = PaddleOCR(
        lang="chinese_cht",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )

    out = []
    for f in frames:
        entry = {"file": f, "lines": []}
        try:
            for res in ocr.predict(f):
                texts = res.get("rec_texts") or []
                scores = res.get("rec_scores") or []
                boxes = res.get("rec_boxes")
                boxes = boxes.tolist() if boxes is not None and hasattr(boxes, "tolist") else (boxes or [])
                # normalize bbox 用嘅畫面大細
                w = h = None
                try:
                    import PIL.Image
                    with PIL.Image.open(f) as im:
                        w, h = im.size
                except Exception:
                    pass
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

    json.dump(out, sys.stdout, ensure_ascii=False)

if __name__ == "__main__":
    main()
