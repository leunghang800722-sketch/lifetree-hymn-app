// OdeIcon — 統一 icon component(ODE-REBRAND-PLAN §R2 / ODE-HANDOFF §5)
//
// 讀 odeIcons.js 嘅 ODE_ICONS,24×24 viewBox、stroke 1.75、round cap/join。
// 全 App 淨係用呢一個 component 出 icon,唔准混用 @expo/vector-icons 或者
// emoji/文字符號當 icon(§7 驗收清單)。
//
// Props:
//   name    — ODE_ICONS 嘅 key(例:'heart' 'play' 'chevronRight')
//   size    — 顯示尺寸(dp),預設 24
//   color   — icon 顏色,預設 iconState.idle
//   filled  — true 就用 icon 嘅 fill 版(冇 fill 版就自動 fallback 用 stroke 版)
//
// 用法:<OdeIcon name="heart" size={22} color={iconState.saved} filled />
import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { ODE_ICONS, STROKE_WIDTH, VIEWBOX } from './odeIcons';
import { iconState } from '../theme/designSystem';

function Shape({ shape, mode, color }) {
  const isFilled = shape.fill === true || mode === 'fill';
  const common = isFilled
    ? { fill: color }
    : { fill: 'none', stroke: color, strokeWidth: STROKE_WIDTH };
  if (shape.type === 'circle') {
    return <Circle cx={shape.cx} cy={shape.cy} r={shape.r} {...common} />;
  }
  if (shape.type === 'rect') {
    return <Rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx || 0} {...common} />;
  }
  return null;
}

export default function OdeIcon({ name, size = 24, color = iconState.idle, filled = false, style }) {
  const icon = ODE_ICONS[name];
  if (!icon) {
    if (__DEV__) console.warn(`[OdeIcon] 冇呢個 icon: "${name}"`);
    return null;
  }

  // 有 fill 版又要求 filled 先用 f/fShapes;冇 fill 版(好多 icon 淨係得 stroke)
  // 就 fallback 用 s/shapes,唔理 filled prop。
  // Opus 第三輪覆核揪到嘅根因:play/playSmall/prev/next 淨係有 `f` 冇 `s`,
  // 但成 10 個 call site(播放器主掣、mini player、prev/next、播全部 pill)
  // 全部冇傳 `filled`——舊邏輯 `filled && (...)` 喺 filled=false 時
  // useFill=false,於是 `paths = icon.s = undefined`,成個 icon 冧晒得返
  // 個空隙(prev/next 淨返 fill:true 嗰條豎棒,冇三角)。加 `!icon.s` 令
  // 「冇 stroke 版嘅 icon」唔理 filled prop 都自動行 fill 分支——同一段
  // 邏輯已經係 icon.f 冇 icon.s 就 fallback 用 f 嘅原意,淨係之前漏咗呢個
  // case。淨影響 play/playSmall/prev/next 呢 4 個(其餘 icon 全部有 `s`,
  // `!icon.s` 恒為 false,行為完全唔變)。
  const useFill = (filled || !icon.s) && (icon.f || icon.fShapes);
  const paths = useFill ? icon.f : icon.s;
  // F1(ODE-REBRAND-PLAN)真根因:fill 模式冇 fShapes 就唔准齋齋 fallback 去
  // icon.shapes——嗰組係畫俾 stroke 版 `s` 配對嘅描邊裝飾圖元(例:library
  // 嘅外框 rect + 音符 circle),唔係設計嚟同 fill path 一齊出。如果照舊fallback
  // 用埋,Shape() 見 mode==='fill' 會將呢啲裝飾圖元都實心填晒,一嚿大大隻
  // rect 剛好蓋晒 `f` 個 evenodd 鏤空位,睇落好似成個 icon 變咗實心方塊。
  // 淨係當個別 shape 自己標咗 `fill:true`(例:prev/next 嗰條永遠實心嘅
  // bar,設計原意係唔理 mode 都要顯示)先保留落嚟。
  const shapes = useFill
    ? (icon.fShapes || (icon.shapes || []).filter((sh) => sh.fill === true))
    : icon.shapes;
  const mode = useFill ? 'fill' : 'stroke';

  return (
    <Svg width={size} height={size} viewBox={VIEWBOX} style={style}>
      {(paths || []).map((d, i) => (
        <Path
          key={`p${i}`}
          d={d}
          fill={mode === 'fill' ? color : 'none'}
          // F1(ODE-REBRAND-PLAN):fill 版有啲 icon(例:library)一個 `d`
          // 入面夾住外框+內部鏤空剪影兩個 subpath,預設 nonzero 唔會鏤空、
          // 會實心填晒變一嚿色塊。evenodd 令重疊部分互相抵消,鏤空返出嚟。
          // 單一剪影嘅 filled icon 加呢個屬性冇副作用,所以全部 fill path 統一加。
          fillRule={mode === 'fill' ? 'evenodd' : undefined}
          stroke={mode === 'fill' ? 'none' : color}
          strokeWidth={mode === 'fill' ? 0 : STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {(shapes || []).map((shape, i) => (
        <Shape key={`s${i}`} shape={shape} mode={mode} color={color} />
      ))}
    </Svg>
  );
}
