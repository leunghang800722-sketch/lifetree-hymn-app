// AdminEditHymnSheet — admin 專用「改歌名/分類、落架」sheet
// (MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7 入口一:歌曲行 long-press)
//
// 同 AddToPlaylistSheet.js 一樣做 Provider + hook,任何列表畫面(LibraryScreen/
// HymnListScreen)long-press 一首歌都撳得到,唔使逐個畫面自己起一份 sheet 邏輯。
// open(hymn) 淨係要嗰行嘅 { id },真正嘅表單資料由 GET /api/admin/hymns/:id
// 重新攞(嗰行 list 傳落嚟嘅 hymn 可能係 `hymns` view 嘅精簡版,冇 category 等
// 欄位)。
//
// isAdmin gate:呢個 Provider 本身唔靠自己隱藏(member 冇 long-press 入口,見
// LibraryScreen/HymnListScreen),但 open() 都多重一重 isAdmin check——就算未來
// 邊個漏咗喺入口度加 gate,呢度都唔會真係彈得出嚟。

import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import { adminGetHymn, adminPatchHymn, adminDelistHymn, adminErrorMessage } from '../api';
import { notifyHymnsChanged } from '../hooks/useCachedHymns';

const Ctx = createContext(null);
export const useAdminEditHymn = () => useContext(Ctx) || { open: () => {} };

// 分類/語言 picker——現有分類 + 自由輸入(§3.7)。呢兩個陣列對應 hymns_all
// 實際跑緊嘅值(2026-07-31 查過 DB:category 有 詩歌/粵語/國語/兒童,lang
// 有 粵語/國語/英文/兒童),撳一下就填,唔啱都可以自己打。
const CATEGORY_SUGGESTIONS = ['詩歌', '粵語', '國語', '兒童'];
const LANG_OPTIONS = ['粵語', '國語', '英文', '兒童'];

// org/performer:TAXONOMY-5D-PLAN.md §2.2/§4.4 五維分類——「團體」(org)同
// 「歌手」(performer)。artist 欄保留舊意義唔郁(§2.1 additive-only),
// 呢兩個係新增獨立輸入欄。
const FIELD_LABELS = {
  display_title: '顯示歌名',
  artist: '團體(舊欄)',
  org: '團體',
  performer: '歌手',
  category: '分類',
  album: '專輯',
  title_en: '英文名',
};

export function AdminEditHymnProvider({ children }) {
  const { isAdmin, getToken } = useAuth();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [original, setOriginal] = useState(null); // GET 返嚟嘅原始行(俾 PATCH diff 用)
  // kids:TAXONOMY-5D-PLAN.md §8 C2 觀察②——顯式開關,唔再由 lang==='兒童' 推。
  const [form, setForm] = useState({ display_title: '', artist: '', org: '', performer: '', category: '', lang: '粵語', album: '', title_en: '', kids: false });

  // saving 一定要喺呢度清返:落架成功嗰條路徑只係 close(),如果 close 唔清
  // saving,下次 open 返個 sheet 就會帶住 saving=true 開,儲存/落架兩個掣
  // 都 disabled={saving},撳落去毫無反應(第二首歌落唔到架嘅 bug)。
  const close = useCallback(() => {
    setVisible(false); setOriginal(null); setError(''); setSaving(false);
  }, []);

  const open = useCallback(async (hymn) => {
    if (!isAdmin || !hymn?.id) return;
    // open 都清多次——就算將來有邊條路徑漏咗經 close(),都唔會開住個死咗嘅 sheet。
    setVisible(true); setLoading(true); setError(''); setSaving(false);
    try {
      const token = getToken();
      const full = await adminGetHymn(token, hymn.id);
      setOriginal(full);
      setForm({
        display_title: full.display_title || '',
        artist: full.artist || '',
        org: full.org || '',
        performer: full.performer || '',
        category: full.category || '',
        lang: full.lang || '粵語',
        album: full.album || '',
        title_en: full.title_en || '',
        kids: Number(full.kids) === 1,
      });
    } catch (e) {
      setError(adminErrorMessage(e, '讀取失敗'));
    }
    setLoading(false);
  }, [isAdmin, getToken]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = useCallback(async () => {
    if (!original) return;
    // 淨係送有改過嘅欄位——PATCH 白名單 + 「最少一個欄位」由後端把關,
    // 但前端唔使亂送一大堆冇變化嘅欄位。
    const changed = {};
    for (const key of ['display_title', 'artist', 'org', 'performer', 'category', 'lang', 'album', 'title_en']) {
      if ((form[key] || '') !== (original[key] || '')) changed[key] = form[key];
    }
    // kids:顯式 int 開關,唔好同其他 string 欄一齊用 `|| ''` 比較(§8 C2 觀察②)。
    const kidsVal = form.kids ? 1 : 0;
    if (kidsVal !== (Number(original.kids) || 0)) changed.kids = kidsVal;
    if (!Object.keys(changed).length) { close(); return; }

    setSaving(true); setError('');
    try {
      const token = getToken();
      const { dataVersion } = await adminPatchHymn(token, original.id, changed);
      notifyHymnsChanged(dataVersion);
      close();
    } catch (e) {
      setError(adminErrorMessage(e, '儲存失敗'));
    }
    setSaving(false);
  }, [original, form, getToken, close]);

  const confirmDelist = useCallback(() => {
    if (!original) return;
    Alert.alert(
      '落架呢首歌?',
      `「${original.display_title || original.title}」會由詩歌庫消失(資料唔會刪,可以之後重新上架)。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '落架', style: 'destructive',
          onPress: async () => {
            setSaving(true); setError('');
            try {
              const token = getToken();
              const { dataVersion } = await adminDelistHymn(token, original.id);
              notifyHymnsChanged(dataVersion);
              close();
            } catch (e) {
              setError(adminErrorMessage(e, '落架失敗'));
              setSaving(false);
            }
          },
        },
      ]
    );
  }, [original, getToken, close]);

  const row = (key, opts = {}) => (
    <View style={styles.fieldRow} key={key}>
      <Text style={styles.fieldLabel}>{FIELD_LABELS[key]}</Text>
      <TextInput
        style={styles.fieldInput}
        value={form[key]}
        onChangeText={(v) => setField(key, v)}
        placeholder={opts.placeholder || ''}
        placeholderTextColor={COLORS.textSecondary}
        maxLength={200}
      />
    </View>
  );

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
        <KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
          <View style={styles.card}>
            <View style={styles.handle} />
            <Text style={styles.title}>編輯詩歌</Text>

            {loading ? (
              <Text style={styles.loadingText}>載入緊…</Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
                {original && (
                  <View style={styles.originalTitleWrap}>
                    <Text style={styles.originalTitleLabel}>原始 YouTube 標題(唔可以改)</Text>
                    <Text style={styles.originalTitleText} numberOfLines={2}>{original.title}</Text>
                  </View>
                )}

                {row('display_title')}
                {row('artist')}
                {/* org 唔准留空(後端會 400)——觀察③:文案改到同行為一致 */}
                {row('org', { placeholder: '例:泥土音樂(必填,唔可以留空)' })}
                {row('performer', { placeholder: '例:盛曉玫(可留空,UI 會 fallback 顯示團體)' })}

                <View style={styles.fieldRow}>
                  <View style={styles.switchRow}>
                    <Text style={styles.fieldLabel}>兒童詩歌</Text>
                    <Switch
                      value={form.kids}
                      onValueChange={(v) => setField('kids', v)}
                      trackColor={{ false: COLORS.border, true: COLORS.glow }}
                      thumbColor={COLORS.card}
                    />
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>分類</Text>
                  <View style={styles.chipRow}>
                    {CATEGORY_SUGGESTIONS.map((c) => (
                      <TouchableOpacity key={c} style={[styles.chip, form.category === c && styles.chipActive]}
                        onPress={() => setField('category', c)} activeOpacity={0.7}>
                        <Text style={[styles.chipText, form.category === c && styles.chipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.category}
                    onChangeText={(v) => setField('category', v)}
                    placeholder="或者自己打"
                    placeholderTextColor={COLORS.textSecondary}
                    maxLength={200}
                  />
                </View>

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>語言</Text>
                  <View style={styles.chipRow}>
                    {LANG_OPTIONS.map((l) => (
                      <TouchableOpacity key={l} style={[styles.chip, form.lang === l && styles.chipActive]}
                        onPress={() => setField('lang', l)} activeOpacity={0.7}>
                        <Text style={[styles.chipText, form.lang === l && styles.chipTextActive]}>{l}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {row('album', { placeholder: '(可留空)' })}
                {row('title_en', { placeholder: '(可留空)' })}

                {!!error && <Text style={styles.errText}>{error}</Text>}

                {/* disabled 一定要睇得出——舊版兩個掣 disabled 完全冇視覺變化,
                    saving 卡死咗都好似撳得,睇落就係「撳唔郁」。 */}
                <TouchableOpacity style={[styles.saveBtn, saving && styles.btnDisabled]} onPress={save} disabled={saving} activeOpacity={0.8}>
                  <Text style={styles.saveBtnText}>{saving ? '儲存緊…' : '儲存'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.delistBtn, saving && styles.btnDisabled]} onPress={confirmDelist} disabled={saving} activeOpacity={0.8}>
                  <OdeIcon name="trash" size={18} color={COLORS.danger} />
                  <Text style={styles.delistBtnText}>落架呢首</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card: {
    maxHeight: '85%', backgroundColor: COLORS.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 24,
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.textSecondary, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
  title: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '600', paddingVertical: 12 },
  loadingText: { color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 30 },
  originalTitleWrap: {
    backgroundColor: COLORS.background, borderRadius: 10, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  originalTitleLabel: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 4 },
  originalTitleText: { color: COLORS.textPrimary, fontSize: 14 },
  fieldRow: { marginBottom: 14 },
  fieldLabel: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 6, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldInput: {
    backgroundColor: COLORS.background, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, color: COLORS.textPrimary, fontSize: 15,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: COLORS.background, marginRight: 8, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  chipTextActive: { color: COLORS.textOnGlow },
  errText: { color: COLORS.danger, fontSize: 13, marginBottom: 10 },
  saveBtn: {
    backgroundColor: COLORS.glow, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: COLORS.textOnGlow, fontWeight: '700', fontSize: 16 },
  delistBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginTop: 8,
  },
  delistBtnText: { color: COLORS.danger, fontWeight: '600', fontSize: 15, marginLeft: 6 },
  btnDisabled: { opacity: 0.5 },
});
