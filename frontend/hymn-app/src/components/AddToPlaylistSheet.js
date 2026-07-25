// 「加入到清單」揀清單 sheet —— App 層級,任何畫面都撳得(播放頁「清單」pill、
// 「我的」最愛清單、「睇晒」歌單…全部行同一個)。參考 YouTube Music 個「儲存到播放清單」。
//
// §MYPAGE-PLAYLIST-MANAGE-PLAN:泛化做三個 mode,共用同一個 Modal、同一套鍵盤避讓、
// 同一個名字輸入框 —— 唔准另起一套建立/改名流程,免得行為分叉:
//   * open(hymn)      = 'add'    原有「加入到清單」,行為一 pixel 都冇變
//   * openCreate()    = 'create' 淨係名字輸入框,建立一個空清單(「我的」頁＋掣用)
//   * openRename(pl)  = 'rename' 輸入框預填舊名,確認改名
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

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Keyboard } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS } from '../theme/designSystem';
import { usePlaylists, MAX_PLAYLIST_SONGS } from '../context/PlaylistsContext';
import { useInsets } from '../hooks/useInsets';

const Ctx = createContext(null);
// Android keyboardDidShow 個高度唔包上面條建議/emoji 工具列,補呢個高度令輸入框
// 一定清到嗰條 bar。寧願多留少少 gap,好過又俾檔住。
const KB_EXTRA = 52;
// open(hymn):彈 sheet,揀清單加入呢首歌。openCreate/openRename 見檔頭。
export const useAddToPlaylist = () => useContext(Ctx) || { open: () => {}, openCreate: () => {}, openRename: () => {} };

export function AddToPlaylistProvider({ children }) {
  const { playlists = [], addToPlaylist, createPlaylist, renamePlaylist } = usePlaylists() || {};
  const insets = useInsets(); // 底部「＋新播放清單」唔好俾導航列檔住
  const [mode, setMode] = useState(null); // null | 'add' | 'create' | 'rename'
  const [target, setTarget] = useState(null); // add mode:要加入邊首歌
  const [renameTarget, setRenameTarget] = useState(null); // rename mode:改邊個清單
  const [creating, setCreating] = useState(false); // add mode:展開緊新清單輸入框?
  const [newName, setNewName] = useState('');
  const [kbHeight, setKbHeight] = useState(0); // §Eric #1:鍵盤高度,用嚟抬高個 card
  const [toast, setToast] = useState(''); // 建立清單後嘅輕量非阻擋提示(唔用 Alert —— 黑底 UI 唔啱擺白色系統對話框)
  const toastTimer = useRef(null);
  const visible = !!mode;

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // §Eric #1:打新清單名嗰陣,鍵盤彈出會遮住輸入框/確認掣。聽鍵盤事件,
  // 將 card 抬高鍵盤咁多,令輸入框 keep 喺鍵盤上面。Modal + Android 用
  // KeyboardAvoidingView 好唔穩,呢個手動做法可靠好多。
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates?.height || 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const open = useCallback((hymn) => {
    if (hymn?.id) { setMode('add'); setTarget(hymn); setRenameTarget(null); setCreating(false); setNewName(''); }
  }, []);
  const openCreate = useCallback(() => {
    setMode('create'); setTarget(null); setRenameTarget(null); setCreating(false); setNewName('');
  }, []);
  const openRename = useCallback((pl) => {
    if (pl?.id) { setMode('rename'); setTarget(null); setRenameTarget(pl); setCreating(false); setNewName(pl.name || ''); }
  }, []);
  const close = useCallback(() => {
    setMode(null); setTarget(null); setRenameTarget(null); setCreating(false); setNewName('');
  }, []);

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

  // 開新清單:用戶自己打名(YT Music 咁)。add mode 開完即刻加埋當前呢首;
  // create mode(「我的」頁＋掣)冇 target,就係開一個空清單。
  // §Eric:撳完「建立」以前完全靜雞雞就閂咗,唔知有冇成功 —— 加個 toast 講返俾用戶知。
  const confirmCreate = useCallback(() => {
    const name = newName.trim() || '新播放清單';
    createPlaylist?.(name, target);
    showToast(target ? `已加入「${name}」` : `已建立「${name}」`);
    close();
  }, [newName, createPlaylist, target, close, showToast]);

  // 改名:空名 renamePlaylist 內部會唔理(保留原名),所以呢度唔使 guard。
  const confirmRename = useCallback(() => {
    renamePlaylist?.(renameTarget?.id, newName);
    close();
  }, [renamePlaylist, renameTarget, newName, close]);

  // create / rename 兩個 mode 共用嘅輸入列(add mode 個 footer 都係呢舊 UI,
  // 但佢有自己嘅展開邏輯,keep 返原樣)
  const nameInputRow = (confirmFn, confirmLabel) => (
    <View style={styles.createBox}>
      <TextInput
        style={styles.input}
        value={newName}
        onChangeText={setNewName}
        placeholder="清單名(例如：婚禮)"
        placeholderTextColor={COLORS.textSecondary}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={confirmFn}
        maxLength={40}
      />
      <TouchableOpacity style={styles.createConfirm} onPress={confirmFn} activeOpacity={0.8}>
        <Text style={styles.createConfirmText}>{confirmLabel}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Ctx.Provider value={{ open, openCreate, openRename }}>
      {children}
      {/* ⚠️ Bug fix(2026-07):App 成個 activity 係 edge-to-edge(styles.xml 兩條系統列透明),
          但 native <Modal> 開嘅係另一個獨立 window —— 冇加 navigationBarTranslucent 嘅話,
          呢個 window 會自己讓出導航列高度、唔會頂到真正嘅畫面底。結果:card 個 marginBottom
          (跟住鍵盤高度計)喺呢個「較矮」嘅座標系入面計,會俾導航列高度咁多 —— 即係
          sheet 同鍵盤之間漏一條罅,穿到落去見到後面畫面(玻璃海個 bug)。加呢個 prop
          令 Modal window 都變 edge-to-edge,同 activity 座標系對齊。 */}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
        <View style={styles.scrim}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
          {/* 鍵盤彈出時 card 抬起鍵盤咁高;鍵盤收埋先用返 safe-area inset 墊底。
              §Eric(v242):Android 個 keyboardDidShow 高度**唔包**上面條建議/emoji
              工具列,所以之前仲俾佢檔住半截 —— 加 KB_EXTRA 補返嗰條工具列嘅高度。 */}
          <View style={[styles.card, { marginBottom: kbHeight > 0 ? kbHeight + KB_EXTRA : 0, paddingBottom: kbHeight > 0 ? 12 : 8 + insets.bottom }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>
              {mode === 'create' ? '新播放清單' : mode === 'rename' ? '改清單名' : '加入到清單'}
            </Text>

            {mode === 'create' ? nameInputRow(confirmCreate, '建立') : null}
            {mode === 'rename' ? nameInputRow(confirmRename, '改名') : null}

            {mode === 'add' ? <FlatList
              data={playlists}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                !creating ? <Text style={styles.empty}>仲未有播放清單 —— 撳下面開一個</Text> : null
              }
              ListFooterComponent={
                creating ? (
                  // 開新清單:同 create/rename mode 共用同一舊輸入列 UI
                  nameInputRow(confirmCreate, '建立')
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
            /> : null}
          </View>
        </View>
      </Modal>
      {/* 建立/加入清單後嘅輕量提示 —— 非阻擋(唔使用戶撳掣打斷),1.8s 後自己收埋。 */}
      {toast ? (
        <View pointerEvents="none" style={[styles.toastWrap, { bottom: insets.bottom + 24 }]}>
          <View style={styles.toastBubble}>
            <MaterialIcons name="check-circle" size={16} color={COLORS.accent} style={{ marginRight: 6 }} />
            <Text style={styles.toastText} numberOfLines={1}>{toast}</Text>
          </View>
        </View>
      ) : null}
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
  // 輕量 toast(建立/加入清單後嘅非阻擋提示)
  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 999, elevation: 999 },
  toastBubble: {
    flexDirection: 'row', alignItems: 'center', maxWidth: '86%',
    backgroundColor: COLORS.card, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  toastText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
});
