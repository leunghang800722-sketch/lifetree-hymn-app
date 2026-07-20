// 「加入到清單」揀清單 sheet —— App 層級,任何畫面都撳得(播放頁「清單」pill、
// 「我的」最愛清單、「睇晒」歌單…全部行同一個)。
//
// 點解用 native <Modal> 而唔係 gorhom:呢個 picker 要喺**任何** context 之上彈到出嚟 ——
// 包括疊喺 zIndex:999 嘅播放器 overlay 之上(由 pill 撳),又要喺 tab 內容之上(由清單列
// 撳)。native Modal 係獨立 window,無論邊個 z-order 都一定畫喺最面,唔使同 gorhom 個
// portal 鬥 zIndex(呢個坑 v228/v231 踩過)。播放清單(queue)嗰個仍然係 gorhom,因為佢
// 要真手勢;但呢個 picker 係「撳一下揀一個」嘅對話框,Modal 就啱。
//
// ⚠️ 冇「最愛清單」呢個選項(Eric 2026-07):心心掣已經處理最愛,呢度淨係列用戶自訂
// 嘅「我嘅清單」。

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS } from '../theme/designSystem';
import { usePlaylists, MAX_PLAYLIST_SONGS } from '../context/PlaylistsContext';

const Ctx = createContext(null);
// open(hymn):彈 sheet,揀清單加入呢首歌。
export const useAddToPlaylist = () => useContext(Ctx) || { open: () => {} };

export function AddToPlaylistProvider({ children }) {
  const { playlists = [], addToPlaylist, createPlaylist } = usePlaylists() || {};
  const [target, setTarget] = useState(null); // 要加入邊首歌
  const visible = !!target;

  const open = useCallback((hymn) => { if (hymn?.id) setTarget(hymn); }, []);
  const close = useCallback(() => setTarget(null), []);

  // 加入自訂清單 —— 滿 30 首就唔俾加、彈提示(§Eric v233);已經喺清單就講返。
  const addTo = useCallback((pl) => {
    const res = addToPlaylist?.(pl.id, target);
    if (res?.ok) { close(); return; }
    if (res?.reason === 'full') {
      Alert.alert('清單已滿',
        `「${pl.name}」已經有 ${MAX_PLAYLIST_SONGS} 首,加唔到再多。\n\n可以刪走啲舊歌,或者開一個新清單。`,
        [{ text: '知道喇' }]);
      return;
    }
    if (res?.reason === 'duplicate') {
      Alert.alert('已經喺清單入面', `「${target?.title}」已經加咗落「${pl.name}」。`, [{ text: '知道喇' }]);
      return;
    }
    close();
  }, [addToPlaylist, target, close]);

  // Android 冇 Alert.prompt,所以自動命名,開完即刻加埋當前呢首。
  const createAndAdd = useCallback(() => {
    createPlaylist?.(`我嘅清單 ${(playlists.length || 0) + 1}`, target);
    close();
  }, [createPlaylist, playlists.length, target, close]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
        <View style={styles.scrim}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
          <View style={styles.card}>
            <View style={styles.handle} />
            <Text style={styles.title}>加入到清單</Text>
            <FlatList
              data={playlists}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingBottom: 8 }}
              ListEmptyComponent={
                <Text style={styles.empty}>仲未有自訂清單 —— 撳下面「新增清單」開一個</Text>
              }
              ListFooterComponent={
                <TouchableOpacity style={styles.createRow} onPress={createAndAdd} activeOpacity={0.7}>
                  <MaterialIcons name="playlist-add" size={20} color={COLORS.accent} />
                  <Text style={styles.createText}>新增清單</Text>
                </TouchableOpacity>
              }
              renderItem={({ item }) => {
                const count = item.songs?.length || 0;
                const full = count >= MAX_PLAYLIST_SONGS;
                return (
                  <TouchableOpacity style={[styles.row, { opacity: full ? 0.45 : 1 }]}
                    onPress={() => addTo(item)} activeOpacity={0.7}>
                    <MaterialIcons name="queue-music" size={20} color={full ? COLORS.textSecondary : COLORS.accent} />
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.count, { color: full ? COLORS.gold : COLORS.textSecondary, fontWeight: full ? '700' : '500' }]}>
                      {full ? `已滿 ${count}/${MAX_PLAYLIST_SONGS}` : `${count}/${MAX_PLAYLIST_SONGS}`}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card: {
    maxHeight: '60%', backgroundColor: COLORS.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingBottom: 8,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.textSecondary, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
  title: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 12 },
  empty: { color: COLORS.textSecondary, paddingHorizontal: 20, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  rowName: { color: COLORS.textPrimary, marginLeft: 10, fontSize: 15, flex: 1 },
  count: { fontSize: 13 },
  createRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  createText: { color: COLORS.accent, marginLeft: 10, fontSize: 15, fontWeight: '600' },
});
