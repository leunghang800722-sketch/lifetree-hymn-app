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
  const useFill = filled && (icon.f || icon.fShapes);
  const paths = useFill ? icon.f : icon.s;
  const shapes = useFill ? (icon.fShapes || icon.shapes) : icon.shapes;
  const mode = useFill ? 'fill' : 'stroke';

  return (
    <Svg width={size} height={size} viewBox={VIEWBOX} style={style}>
      {(paths || []).map((d, i) => (
        <Path
          key={`p${i}`}
          d={d}
          fill={mode === 'fill' ? color : 'none'}
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
