// DailyVerseCard — 每日金句(ODE-REBRAND-PLAN §3:金線退場,改宋體 + 暖光短線)
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../theme/designSystem';

export default function DailyVerseCard({ verse }) {
  if (!verse || !verse.text) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>每日金句</Text>
      <Text style={styles.verse}>「{verse.text}」</Text>
      <View style={styles.glowLine} />
      <Text style={styles.ref}>{verse.ref}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 20,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 2.5,
    color: COLORS.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  verse: {
    fontFamily: 'NotoSerifTC-Regular',
    fontSize: 17,
    lineHeight: 17 * 1.85,
    color: COLORS.text,
  },
  glowLine: {
    width: 18,
    height: 1,
    backgroundColor: COLORS.glow,
    marginTop: 14,
    marginBottom: 8,
  },
  ref: {
    fontFamily: 'NotoSerifTC-Regular',
    fontSize: 13,
    color: COLORS.textMuted,
  },
});
