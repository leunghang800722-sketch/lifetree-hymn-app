// ocrframe.swift —— LYRICS-PIPELINE-PLAN 任務1:OCR 主力工具。
// 用 macOS 內置 Vision framework(VNRecognizeTextRequest)讀一張 frame 入面嘅字,
// 比 tesseract 快好多亦準好多(尤其繁體),而且 app 本身就喺 Mac 度跑,唔使裝額外模型。
//
// 用法:ocrframe <圖片路徑>
// 輸出:每行一句辨識到嘅文字,由上到下、由左到右排(方便 fetchLyrics.js 逐行合併)。
// 冇文字 / 出錯 → 冧行 stderr 講原因,exit 1(fetchLyrics.js 會當呢張 frame 冇字,跳過)。
//
// 編譯(唔好每次都重新 compile,fetchLyrics.js 直接叫呢個已編譯好嘅 binary):
//   swiftc -O backend/tools/ocrframe.swift -o backend/tools/ocrframe
//
// 語言:zh-Hant(繁體,粵語詩歌 MV 大多數用呢個)、zh-Hans(簡體,國語詩歌)、
// en-US(英文詩歌)。recognitionLevel = .accurate(準確優先,呢個工具本身唔追求
// 極速 —— OCR 一首歌都要幾分鐘,寧願準過快)。

import Foundation
import Vision
#if canImport(AppKit)
import AppKit
#endif

func errExit(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

guard CommandLine.arguments.count > 1 else {
    errExit("用法:ocrframe <圖片路徑>")
}
let imagePath = CommandLine.arguments[1]

guard let nsImage = NSImage(contentsOfFile: imagePath) else {
    errExit("讀唔到圖片檔:\(imagePath)")
}
var rect = NSRect(origin: .zero, size: nsImage.size)
guard let cgImage = nsImage.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    errExit("圖片轉唔到 CGImage:\(imagePath)")
}

// (yTop, xLeft, text) —— boundingBox 原點喺左下角,轉做「由上到下」要 1 - y - height。
var lines: [(yTop: CGFloat, xLeft: CGFloat, text: String)] = []
var visionError: Error?

let request = VNRecognizeTextRequest { req, error in
    if let error = error { visionError = error; return }
    guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
    for obs in observations {
        guard let best = obs.topCandidates(1).first else { continue }
        let box = obs.boundingBox
        let yTop = 1 - box.origin.y - box.height
        lines.append((yTop: yTop, xLeft: box.origin.x, text: best.string))
    }
}
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
// 繁體行先(粵語詩歌 MV 佔多數),簡體、英文次之。
request.recognitionLanguages = ["zh-Hant", "zh-Hans", "en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
do {
    try handler.perform([request])
} catch {
    errExit("Vision 辨識出錯:\(error)")
}
if let e = visionError { errExit("Vision 辨識出錯:\(e)") }

lines.sort { a, b in
    if abs(a.yTop - b.yTop) > 0.02 { return a.yTop < b.yTop } // 唔同行(容忍少少偏差)
    return a.xLeft < b.xLeft
}
for line in lines {
    print(line.text)
}
