// LogoRing — 品牌日蝕環 logo,由 assets/logo-ring.png 原圖裁出。
// 原圖留白多,直接用 resizeMode="contain" 顯示個環會偏細(ODE-HANDOFF §3.1 bug)。
// 呢度跟 docs/design-ode/odeTheme.js 嘅 logoRing()/logoRingImage() 公式:
// 圖放大到容器 1.6 倍,再用負 margin 位移裁切,外層 overflow:hidden 圓形裁到只剩中央環。
// 四處用緊同一張源圖嘅位(header/播放器頂/AuthScreen/PhoneLoginScreen)全部經呢個
// component,size 一改全部受惠。
import React from 'react';
import { View, Image } from 'react-native';

const logoRingSource = require('../../assets/logo-ring.png');

export default function LogoRing({ size = 52, style }) {
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' },
        style,
      ]}
    >
      <Image
        source={logoRingSource}
        style={{
          width: size * 1.6,
          height: size * 1.6,
          marginLeft: -size * 0.3,
          marginTop: -size * 0.255,
        }}
      />
    </View>
  );
}
