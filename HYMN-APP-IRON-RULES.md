# 詩歌App — 核心架構鐵律（PINNED）

## 絕對禁止
- **嚴禁 onLayout / 動態測量驅動 Native Driver 動畫** → 會 crash
- 所有 translateY outputRange 必須是 **硬編碼常數**，唔可以用 state / useMemo / runtime value

## 固定的 DOM 順序（Y 軸）
```
[影片]
[上半彈簧 flex:1]
[控制區 (zIndex:99)]     ← 電梯 1，translateY: [0, -CONTROLS_LIFT]
[下半彈簧 flex:1]
[拖拽把手 + 清單]        ← 電梯 2，translateY: [0, -SHEET_HEIGHT]
```
**絕對不準調亂呢個順序！** 控制區一定喺把手之上。

## 差速平移（雙電梯）
- Handle lift = `SHEET_HEIGHT`（固定）
- Controls lift = 硬編碼常數（~270px），原則：Handle 升起後剛好停在 Controls 正下方邊緣
- 同一 `drawerAnim` 同步驅動，outputRange 不同產生差速
- 控制區 `zIndex: 99` → Handle 追到都喺後面，唔會遮擋播放鍵

## 防走光
- 清單抽屜：`position: absolute, top: 100%` 相對 Handle 容器
- 收起時清單 `opacity: 0`（用獨立 Animated.Value `sheetOpacity`）
- 展開時瞬開 `sheetOpacity.setValue(1)`
- Handle 容器**無 paddingBottom** → `top:100%` 精準 = Handle 底部

## Overlay
- `position: absolute, top: 0, left: 0, right: 0, bottom: 0`
- 用 `bottom:0` 唔係 `height:SCREEN_HEIGHT` → 先填滿物理螢幕

## Build APK
- Build command：`cd frontend/hymn-app/android && ANDROID_HOME=$HOME/Library/Android/sdk JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home ./gradlew assembleRelease`
- **每次 build 完必須 auto-copy：** `cp android/app/build/outputs/apk/release/app-release.apk ~/Desktop/詩歌App/hymn-app-v{版本}.apk`
