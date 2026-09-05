// 「在線」sheet(ADMIN-PRESENCE-EXEC-20260905 §3)—— 淨係 admin 睇到,MineScreen
// 個 chip 撳落開。頂三個數(總在線/會員/訪客),列表逐行:名/前台或背景播放
// 標籤/連續在線時長。30 秒自動刷新 + 落拉刷新(pattern 照 FriendSharesSheet)。
//
// 唔顯示正在聽邊首歌(Eric 拍板③),歷史留第二版(④淨係即時)。
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, Animated, PanResponder } from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { adminPresence } from '../api';

const AUTO_REFRESH_MS = 30 * 1000;

// 「X 小時 Y 分」/ 「Y 分鐘」(§3)
function formatDuration(sec) {
  const totalMin = Math.max(0, Math.floor((sec || 0) / 60));
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours > 0) return `${hours} 小時 ${mins} 分`;
  return `${mins} 分鐘`;
}

export default function AdminPresenceSheet({ visible, onClose, getToken }) {
  const insets = useInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null); // { online:{total,members,guests}, members:[...] }
  const [err, setErr] = useState(false);
  const loadSeq = useRef(0);

  // mode: 'initial'(首次載入)| 'refresh'(下拉)| 'silent'(30 秒背景自動
  // 刷新)。P3(Opus 5 驗收 3f 保留已修):淨係 initial/refresh 先郁
  // loading/refreshing state,silent 唔會令成個名單閃返做 spinner——數字
  // tile 同列表喺背景刷新期間留住舊值,直到新資料到先一次過換。
  const load = useCallback((mode) => {
    const seq = ++loadSeq.current;
    if (mode === 'refresh') setRefreshing(true);
    else if (mode !== 'silent') setLoading(true);
    setErr(false);
    const token = getToken ? getToken() : null;
    adminPresence(token)
      .then((r) => { if (loadSeq.current === seq) setData(r); })
      .catch(() => { if (loadSeq.current === seq && mode !== 'silent') setErr(true); }) // Opus2 N3:silent 刷新失敗保留舊名單,唔炒走
      .finally(() => {
        if (loadSeq.current !== seq) return;
        if (mode === 'refresh') setRefreshing(false);
        else if (mode !== 'silent') setLoading(false);
      });
  }, [getToken]);

  useEffect(() => {
    if (!visible) return;
    load('initial');
    const timer = setInterval(() => load('silent'), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [visible, load]);

  // 下滑收起(見 return 內註解)。hooks 要喺 early return 之前。
  const dragY = useRef(new Animated.Value(0)).current;
  const dragHandlers = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => { if (g.dy > 0) dragY.setValue(g.dy); },
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 60 || g.vy > 0.5) {
        Animated.timing(dragY, { toValue: 600, duration: 160, useNativeDriver: true }).start(() => {
          dragY.setValue(0);
          onClose && onClose();
        });
      } else {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
      }
    },
    onPanResponderTerminate: () => { Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start(); },
  }), [dragY, onClose]);

  if (!visible) return null;

  const online = data?.online || { total: 0, members: 0, guests: 0 };
  const members = data?.members || [];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent>
      <View style={styles.scrim}>
        <View style={{ flex: 1 }} onTouchEnd={onClose} />
        <Animated.View style={[styles.card, { paddingBottom: insets.bottom + 16, maxHeight: '80%', transform: [{ translateY: dragY }] }]}>
          {/* 2026-09-06 Eric 真機:「滑下不能收起」——手柄原本純裝飾。頂部
              (手柄+標題+三個數)掛 PanResponder:跟手落,放手超過 60px 或者
              夠快就關;唔夠就彈返上去。FlatList 唔喺呢個區入面,滾動照舊。 */}
          <View {...dragHandlers.panHandlers}>
            <View style={styles.handle} />
            <Text style={styles.title}>在線</Text>

          <View style={styles.statsRow}>
            <View style={styles.statTile}>
              <Text style={styles.statNum}>{online.total}</Text>
              <Text style={styles.statLabel}>總在線</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statNum}>{online.members}</Text>
              <Text style={styles.statLabel}>會員</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statNum}>{online.guests}</Text>
              <Text style={styles.statLabel}>訪客</Text>
            </View>
          </View>
          </View>

          {loading ? (
            <View style={styles.centerState}><ActivityIndicator color={COLORS.glow} /></View>
          ) : err ? (
            <View style={styles.centerState}>
              <Text style={styles.emptyText}>讀取失敗,遲啲再試</Text>
            </View>
          ) : (
            <FlatList
              data={members}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingBottom: 8 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={COLORS.glow} />
              }
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.rowDuration}>{formatDuration(item.durationSec)}</Text>
                  </View>
                  <View style={[styles.tag, item.state === 'bg-playing' ? styles.tagBg : styles.tagFg]}>
                    <Text style={item.state === 'bg-playing' ? styles.tagTextOnGlow : styles.tagText}>
                      {item.state === 'bg-playing' ? '背景播放' : '前台'}
                    </Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.centerState}>
                  <OdeIcon name="me" size={36} color={COLORS.textSecondary} />
                  <Text style={styles.emptyText}>暫時冇人在線</Text>
                </View>
              }
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingTop: 4,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.textSecondary, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
  title: { ...TYPOGRAPHY.body, fontSize: 17, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 12 },
  statsRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12 },
  statTile: {
    flex: 1, alignItems: 'center', paddingVertical: 12, marginRight: 8,
    backgroundColor: COLORS.cardLight, borderRadius: 12,
  },
  statNum: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  centerState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.cardLight, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowName: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '600' },
  rowDuration: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  tagFg: { backgroundColor: COLORS.cardLight },
  tagBg: { backgroundColor: COLORS.primary },
  tagText: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
  tagTextOnGlow: { fontSize: 12, fontWeight: '700', color: COLORS.textOnGlow },
});
