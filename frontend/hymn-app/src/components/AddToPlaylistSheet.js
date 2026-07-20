// 「加入到清單」揀清單 sheet —— App 層級,任何畫面都撳得(播放頁「清單」pill、
// 「我的」最愛清單、「睇晒」歌單…全部行同一個)。參考 YouTube Music 個「儲存到播放清單」。
//
// 點解用 native <Modal> 而唔係 gorhom:呢個 picker 要喺**任何** context 之上彈到出嚟 ——
// 包括疊喺 zIndex:999 嘅播放器 overlay 之上(由 pill 撳),又要喺 tab 內容之上(由清單列
// 撳)。native Modal 係獨立 window,無論邊個 z-order 都一定畫喺最面(v228/v231 踩過 gorhom
// portal z-order 個坑)。播放清單(queue)嗰個仍然係 gorhom(要真手勢);呢個 picker 係
// 「撳一下揀一個」嘅對話框,Modal 就啱。
//
// ⚠️ 冇「最愛清單」呢個選項(Eric 2026-07):心心掣已經處理最愛,呢度淨係列用戶自訂
// 嘅播放清單。列表顯示「清單名 + N 首歌曲」(YT Music 咁);底部「＋新播放清單」撳落
// 即場展開一個標題輸入框開新清單。

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS } from '../theme/designSystem';
import { usePlaylists, MAX_PLAYLIST_SONGS } from '../context/PlaylistsContext';
import { useInsets } from '../hooks/useInsets';

const Ctx = createContext(null);
// open(hymn):彈 sheet,揀清單加入呢首歌。
export const useAddToPlaylist = () => useContext(Ctx) || { open: () => {} };

export function AddToPlaylistProvider({ children }) {
  const { playlists = [], addToPlaylist, createPlaylist } = usePlaylists() || {};
  const insets = useInsets(); // §Eric #2:底部「＋新播放清單」唔好俾導航列檔住
  const [target, setTarget] = useState(null); // 要加入邊首歌
  const [creating, setCreating] = useState(false); // 展開緊新清單輸入框?
  const [newName, setNewName] = useState('');
  const visible = !!target;

  const open = useCallback((hymn) => {
    if (hymn?.id) { setTarget(hymn); setCreating(false); setNewName(''); }
  }, []);
  const close = useCallback(() => { setTarget(null); setCreating(false); setNewName(''); }, []);

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

  // 開新清單:用戶自己打名(YT Music 咁),開完即刻加埋當前呢首。
  const confirmCreate = useCallback(() => {
    const name = newName.trim() || '新播放清單';
    createPlaylist?.(name, target);
    close();
  }, [newName, createPlaylist, target, close]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
        <View style={styles.scrim}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
          <View style={[styles.card, { paddingBottom: 8 + insets.bottom }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>加入到清單</Text>

            <FlatList
              data={playlists}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                !creating ? <Text style={styles.empty}>仲未有播放清單 —— 撳下面開一個</Text> : null
              }
              ListFooterComponent={
                creating ? (
                  // 開新清單:標題輸入框 + 建立
                  <View style={styles.createBox}>
                    <TextInput
                      style={styles.input}
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="清單名(例如：婚禮)"
                      placeholderTextColor={COLORS.textSecondary}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={confirmCreate}
                      maxLength={40}
                    />
                    <TouchableOpacity style={styles.createConfirm} onPress={confirmCreate} activeOpacity={0.8}>
                      <Text style={styles.createConfirmText}>建立</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.newRow} onPress={() => setCreating(true)} activeOpacity={0.7}>
                    <MaterialIcons name="add" size={22} color={COLORS.accent} />
                    <Text style={styles.newText}>新播放清單</Text>
                  </TouchableOpacity>
                )
              }
              renderItem={({ item }) => {
                const count = item.songs?.length || 0;
                const full = count >= MAX_PLAYLIST_SONGS;
                return (
                  <TouchableOpacity style={[styles.row, { opacity: full ? 0.45 : 1 }]}
                    onPress={() => addTo(item)} activeOpacity={0.7}>
                    <View style={styles.rowIcon}>
                      <MaterialIcons name="queue-music" size={22} color={full ? COLORS.textSecondary : COLORS.accent} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.rowCount}>
                        {full ? `已滿・${MAX_PLAYLIST_SONGS} 首歌曲` : `${count} 首歌曲`}
                      </Text>
                    </View>
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
    maxHeight: '65%', backgroundColor: COLORS.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingBottom: 8,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.textSecondary, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
  title: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 12 },
  empty: { color: COLORS.textSecondary, paddingHorizontal: 20, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  rowIcon: {
    width: 44, height: 44, borderRadius: 6, backgroundColor: COLORS.cardLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rowText: { flex: 1, marginLeft: 12 },
  rowName: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '600' },
  rowCount: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  // 底部「新播放清單」
  newRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4,
  },
  newText: { color: COLORS.accent, marginLeft: 8, fontSize: 15, fontWeight: '700' },
  createBox: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4,
  },
  input: {
    flex: 1, backgroundColor: COLORS.background, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, color: COLORS.textPrimary, fontSize: 15,
    borderWidth: 1, borderColor: COLORS.border,
  },
  createConfirm: {
    marginLeft: 10, backgroundColor: COLORS.accent, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 11,
  },
  createConfirmText: { color: COLORS.background, fontWeight: '700', fontSize: 15 },
});
