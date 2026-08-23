// 全 App 唯一嘅 safe-area inset 來源。
//
// ⚠️ 點解一定要落 inset:`android/app/src/main/res/values/styles.xml` 入面
// 兩條系統列都設成透明:
//     <item name="android:statusBarColor">@android:color/transparent</item>
//     <item name="android:navigationBarColor">@android:color/transparent</item>
// 即係成個 App 係 **edge-to-edge**,畫面會畫到入狀態列同導航列下面。所以**每一個
// 有 header 或者有底部元件嘅畫面都必須自己落返 inset**,唔落就會出現:
//   * 頂:大字標題同時間/電量疊埋(v231 之前「我的」「詩歌庫」就係咁)
//   * 底:tab 掣、播放清單 collapsed bar 俾導航列黑條蓋住
//
// 之前每個畫面各自 `StatusBar.currentHeight || 24` 咁寫(仲有幾個乜都冇寫),
// 所以先至會逐個畫面撞返同一個 bug。呢個 hook 做返唯一來源,一次過修晒。
//
// 用 try/require 包住 safe-area-context:萬一個 native module 出事,退返去
// StatusBar.currentHeight,總之唔會 crash、亦唔會變 0 蓋住嘢。

import { Platform, StatusBar } from 'react-native';

let libUseSafeAreaInsets = null;
try {
  libUseSafeAreaInsets = require('react-native-safe-area-context').useSafeAreaInsets;
} catch (e) {}

// Android 就算係全手勢導航,底部條 gesture bar 都佔 ~24dp;留個地板免得計出 0。
const ANDROID_MIN_BOTTOM = 16;
const ANDROID_FALLBACK_TOP = StatusBar.currentHeight || 24;

export function useInsets() {
  const raw = typeof libUseSafeAreaInsets === 'function' ? libUseSafeAreaInsets() : null;

  const top = raw?.top || (Platform.OS === 'ios' ? 44 : ANDROID_FALLBACK_TOP);
  const rawBottom = raw?.bottom || 0;
  const bottom = Platform.OS === 'android'
    ? Math.max(rawBottom, ANDROID_MIN_BOTTOM)
    : Math.max(rawBottom, 0);

  return { top, bottom };
}
