// VersionTag —— 一行灰字顯示「實際行緊嘅版本」(§2.6a MEMBERSHIP-PHASE1-LOGIN-SYNC.md)。
// 背景:SettingsScreen 舊版淨顯示 app.json 嘅 native build 版本,OTA 推咗都唔會變,
// 撞單過「以為部機收咗新 OTA 其實仲係舊版」嘅烏龍。呢度改用 expo-updates runtime API
// 攞返部機 actual 行緊邊個 update,對得返 `eas update:list`。
import React from 'react';
import { Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { COLORS } from '../theme/designSystem';

function formatHKTime(dateLike) {
  const d = new Date(dateLike);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function buildLabel() {
  const appVersion = Constants.expoConfig?.version || '—';
  let otaPart = '內置包';
  try {
    // eslint-disable-next-line global-require
    const Updates = require('expo-updates');
    if (__DEV__ || Updates.isEmbeddedLaunch || !Updates.updateId) {
      otaPart = '內置包';
    } else {
      const time = Updates.createdAt ? formatHKTime(Updates.createdAt) : '';
      const shortId = Updates.updateId.slice(0, 8);
      otaPart = time ? `OTA ${time} · ${shortId}` : `OTA · ${shortId}`;
    }
  } catch (e) {
    otaPart = '內置包';
  }
  return `v${appVersion} · ${otaPart}`;
}

export default function VersionTag({ style }) {
  let label = 'v— · 內置包';
  try {
    label = buildLabel();
  } catch (e) {
    // 全部包 try/catch —— 呢個 component 唔准整冧登入頁
  }
  return <Text style={[styles.text, style]}>{label}</Text>;
}

const styles = StyleSheet.create({
  text: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
