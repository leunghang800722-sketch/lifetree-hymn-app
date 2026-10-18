// react-native 嘅 harness stub —— 淨係 InteractionManager.runAfterInteractions。
// 歌詞延後 fetch 係背景 8s/15s 計時路徑,場景斷言唔依賴;callback 唔觸發
// (等同「長期有 interaction」),避免 harness 拖長。
export const InteractionManager = {
  runAfterInteractions() { return { cancel() {} }; },
};
