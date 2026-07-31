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
  StyleSheet, Alert, Keyboard, KeyboardAvoidingView, Platform,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import { adminGetHymn, adminPatchHymn, adminDelistHymn } from '../api';
import { notifyHymnsChanged } from '../hooks/useCachedHymns';

const Ctx = createContext(null);
export const useAdminEditHymn = () => useContext(Ctx) || { open: () => {} };

// 分類/語言 picker——現有分類 + 自由輸入(§3.7)。呢兩個陣列對應 hymns_all
// 實際跑緊嘅值(2026-07-31 查過 DB:category 有 詩歌/粵語/國語/兒童,lang
// 有 粵語/國語/英文/兒童),撳一下就填,唔啱都可以自己打。
const CATEGORY_SUGGESTIONS = ['詩歌', '粵語', '國語', '兒童'];
const LANG_OPTIONS = ['粵語', '國語', '英文', '兒童'];

const FIELD_LABELS = {
  display_title: '顯示歌名',
  artist: '團體',
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
  const [form, setForm] = useState({ display_title: '', artist: '', category: '', lang: '粵語', album: '', title_en: '' });

  const close = useCallback(() => {
    setVisible(false); setOriginal(null); setError('');
  }, []);

  const open = useCallback(async (hymn) => {
    if (!isAdmin || !hymn?.id) return;
    setVisible(true); setLoading(true); setError('');
    try {
      const token = getToken();
      const full = await adminGetHymn(token, hymn.id);
      setOriginal(full);
      setForm({
        display_title: full.display_title || '',
        artist: full.artist || '',
        category: full.category || '',
        lang: full.lang || '粵語',
        album: full.album || '',
        title_en: full.title_en || '',
      });
    } catch (e) {
      setError(e.message || '讀取失敗');
    }
    setLoading(false);
  }, [isAdmin, getToken]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = useCallback(async () => {
    if (!original) return;
    // 淨係送有改過嘅欄位——PATCH 白名單 + 「最少一個欄位」由後端把關,
    // 但前端唔使亂送一大堆冇變化嘅欄位。
    const changed = {};
    for (const key of ['display_title', 'artist', 'category', 'lang', 'album', 'title_en']) {
      if ((form[key] || '') !== (original[key] || '')) changed[key] = form[key];
    }
    if (!Object.keys(changed).length) { close(); return; }

    setSaving(true); setError('');
    try {
      const token = getToken();
      const { dataVersion } = await adminPatchHymn(token, original.id, changed);
      notifyHymnsChanged(dataVersion);
      close();
    } catch (e) {
      setError(e.message || '儲存失敗');
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
              setError(e.message || '落架失敗');
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

                <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} activeOpacity={0.8}>
                  <Text style={styles.saveBtnText}>{saving ? '儲存緊…' : '儲存'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.delistBtn} onPress={confirmDelist} disabled={saving} activeOpacity={0.8}>
                  <MaterialIcons name="delete-outline" size={18} color={COLORS.danger} />
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
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  chipTextActive: { color: COLORS.background },
  errText: { color: COLORS.danger, fontSize: 13, marginBottom: 10 },
  saveBtn: {
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 16 },
  delistBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginTop: 8,
  },
  delistBtnText: { color: COLORS.danger, fontWeight: '600', fontSize: 15, marginLeft: 6 },
});
