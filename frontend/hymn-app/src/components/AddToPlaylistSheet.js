// 「加入到清單」揀清單 sheet —— App 層級,任何畫面都撳得(播放頁「清單」pill、
// 「我的」最愛清單、「睇晒」歌單…全部行同一個)。參考 YouTube Music 個「儲存到播放清單」。
//
// §MYPAGE-PLAYLIST-MANAGE-PLAN:泛化做三個 mode,共用同一個 Modal、同一套鍵盤避讓、
// 同一個名字輸入框 —— 唔准另起一套建立/改名流程,免得行為分叉:
//   * open(hymn)      = 'add'    原有「加入到清單」,行為一 pixel 都冇變
//   * openCreate()    = 'create' 淨係名字輸入框,建立一個空清單(「我的」頁＋掣用)
//   * openRename(pl)  = 'rename' 輸入框預填舊名,確認改名
//
// SHEETSHELL-EXEC-20260906 #1:殼(Modal/backdrop/handle/手勢/鍵盤抬高)搬去
// SheetShell.js——add mode 用 variant="bottom"(fix Android 滑唔到收起嘅
// 根源:呢個檔案原本冇 RNGH 手勢,淨係得 backdrop tap);create/rename 用
// variant="center"。對外 useAddToPlaylist() 嘅 open/openCreate/openRename
// 一個字都冇改。
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import { COLORS } from '../theme/designSystem';
import { usePlaylists, MAX_PLAYLIST_SONGS } from '../context/PlaylistsContext';
import { useInsets } from '../hooks/useInsets';
import SheetShell from './SheetShell';
// PLAYNEXT-EXEC-20260906 §1.2 —— 「下一首播放」要攞 PlayerProvider 嘅
// insertNext()/queue/currentHymn。呢個檔案(AddToPlaylistProvider)喺 App.js
// 嘅 provider tree 係喺 PlayerProvider 外面(祖先),`usePlayer()` context
// 喺呢度攞唔到(FullScreenPlayerOverlay 靠緊而家呢個次序,唔可以掉轉——
// 見 App.js `const tree = (...)` 嗰段註解),所以改用 module-level bridge
// (唔靠 context ancestry,見 src/playerBridge.js 頭註解)。
import { getPlayerBridge } from '../playerBridge';

const Ctx = createContext(null);
// open(hymn):彈 sheet,揀清單加入呢首歌。openCreate/openRename 見檔頭。
export const useAddToPlaylist = () => useContext(Ctx) || { open: () => {}, openCreate: () => {}, openRename: () => {} };

export function AddToPlaylistProvider({ children }) {
  const { playlists = [], addToPlaylist, createPlaylist, renamePlaylist } = usePlaylists() || {};
  const insets = useInsets(); // toast 提示唔好俾導航列檔住
  const [mode, setMode] = useState(null); // null | 'add' | 'create' | 'rename'
  const [target, setTarget] = useState(null); // add mode:要加入邊首歌
  const [renameTarget, setRenameTarget] = useState(null); // rename mode:改邊個清單
  const [creating, setCreating] = useState(false); // add mode:展開緊新清單輸入框?
  const [newName, setNewName] = useState('');
  const [toast, setToast] = useState(''); // 建立清單後嘅輕量非阻擋提示(唔用 Alert —— 黑底 UI 唔啱擺白色系統對話框)
  const toastTimer = useRef(null);
  const visible = !!mode;
  // §2026-07-29 QUEUE-UX-4FIXES §2(a):rename/create 改置中 dialog,'add' 保持貼底 sheet。
  const isCentered = mode === 'create' || mode === 'rename';

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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

  // PLAYNEXT-OPUS-20260906 P2-5 —— 呢行而家永遠顯示(唔再靠
  // `queue.length>0 && currentHymn?.id!=null` 閘住)。執行單 §1.1-1 要求
  // 「冇 queue/冇 current track → 當即刻播」,但舊版 `canPlayNext` 淨係喺
  // 「已經有嘢播緊」先顯示,令嗰條 fallback 路由 UI 行唔到(Opus 驗收:死
  // code、規格自相矛盾)。Fable 拍板:兩條規格互相取消嗰陣,揀「顯示 → 冇
  // 嘢播就即刻播」(同 YT Music 一致),原本嘅 §1.1-1 唔係死 code。
  // insertNext() 自己(App.js)負責去重/播緊嗰首/冇 queue fallback/下架
  // 佔位項阻擋,呢度淨係轉 call + 閂 sheet。`!target.unavailable` 係額外
  // 一層保險(insertNext() 入面嗰道閘先係硬防線,呢度純粹令行根本唔出現)。
  const canPlayNext = mode === 'add' && !!target && !target.unavailable;
  const handlePlayNext = useCallback(() => {
    getPlayerBridge().insertNext?.(target);
    close();
  }, [target, close]);

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
      <SheetShell
        visible={visible}
        onClose={close}
        variant={isCentered ? 'center' : 'bottom'}
        title={mode === 'create' ? '新播放清單' : mode === 'rename' ? '改清單名' : '加入到清單'}
        keyboardAware={!isCentered}
        maxHeight="65%"
      >
        {mode === 'create' ? nameInputRow(confirmCreate, '建立') : null}
        {mode === 'rename' ? nameInputRow(confirmRename, '改名') : null}

        {mode === 'add' ? (
          <FlatList
            data={playlists}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              canPlayNext ? (
                <TouchableOpacity style={styles.playNextRow} onPress={handlePlayNext} activeOpacity={0.7}>
                  <View style={styles.rowIcon}>
                    <OdeIcon name="next" size={22} color={COLORS.primary} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>下一首播放</Text>
                  </View>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              !creating ? <Text style={styles.empty}>仲未有播放清單 —— 撳下面開一個</Text> : null
            }
            ListFooterComponent={
              creating ? (
                nameInputRow(confirmCreate, '建立')
              ) : (
                <TouchableOpacity style={styles.newRow} onPress={() => setCreating(true)} activeOpacity={0.7}>
                  <OdeIcon name="plus" size={22} color={COLORS.primary} />
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
                    <OdeIcon name="queue" size={22} color={full ? COLORS.textSecondary : COLORS.primary} />
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
        ) : null}
      </SheetShell>
      {/* 建立/加入清單後嘅輕量提示 —— 非阻擋(唔使用戶撳掣打斷),1.8s 後自己收埋。 */}
      {toast ? (
        <View pointerEvents="none" style={[styles.toastWrap, { bottom: insets.bottom + 24 }]}>
          <View style={styles.toastBubble}>
            <OdeIcon name="check" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text style={styles.toastText} numberOfLines={1}>{toast}</Text>
          </View>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  empty: { color: COLORS.textSecondary, paddingHorizontal: 20, paddingVertical: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  // 「下一首播放」—— 同下面清單行同一個 row 版型,靠底部分隔線(同 newRow
  // 嗰條視覺一致)分開,唔係加落自訂清單嘅動作。
  playNextRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 4,
  },
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
  newText: { color: COLORS.primary, marginLeft: 8, fontSize: 15, fontWeight: '700' },
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
    marginLeft: 10, backgroundColor: COLORS.glow, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 11,
  },
  createConfirmText: { color: COLORS.textOnGlow, fontWeight: '700', fontSize: 15 },
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
