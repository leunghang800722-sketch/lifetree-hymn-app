// DailyVerseCard — 每日聖經金句
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/theme';

export default function DailyVerseCard({ verse }) {
  if (!verse || !verse.text) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>每日金句</Text>
      <Text style={styles.verse}>「{verse.text}」</Text>
      <Text style={styles.ref}>—— {verse.ref}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 20,
    borderRadius: 12,
    backgroundColor: COLORS.cardBg,
    borderLeftWidth: 3,
    borderLeftColor: '#C8A951', // golden accent
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C8A951',
    letterSpacing: 1,
    marginBottom: 10,
  },
  verse: {
    fontSize: 16,
    color: COLORS.primary,
    lineHeight: 26,
    fontWeight: '500',
  },
  ref: {
    fontSize: 13,
    color: COLORS.secondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
