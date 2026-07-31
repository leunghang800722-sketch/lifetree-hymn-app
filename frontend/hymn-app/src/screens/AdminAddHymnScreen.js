// AdminAddHymnScreen — 貼 YouTube 連結加歌(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7 入口二)
//
// 流程:貼 URL → 撳「查」(POST /api/admin/hymns/preview)→ 出 preview 卡
// (歌名/團體/片長/warnings 黃底提示,全欄位可改)→「確認入庫」
// (POST /api/admin/hymns)→ 成功 toast。exists/relistable/db_busy/422 各自
// 有清楚文案。

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useInsets } from '../hooks/useInsets';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import { adminPreviewHymn, adminAddHymn } from '../api';
import { notifyHymnsChanged } from '../hooks/useCachedHymns';

const CATEGORY_SUGGESTIONS = ['詩歌', '粵語', '國語', '兒童'];
const LANG_OPTIONS = ['粵語', '國語', '英文', '兒童'];

export default function AdminAddHymnScreen({ onClose }) {
  const insets = useInsets();
  const { getToken } = useAuth();
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // yt-dlp metadata + warnings,可編輯
  const [dup, setDup] = useState(null); // { kind: 'exists'|'relistable', hymn }
  const [success, setSuccess] = useState(false);

  const reset = useCallback(() => {
    setPreview(null); setDup(null); setError(''); setSuccess(false);
  }, []);

  const check = useCallback(async () => {
    if (!url.trim()) return;
    reset();
    setChecking(true);
    try {
      const token = getToken();
      const data = await adminPreviewHymn(token, url.trim());
      if (data.exists) {
        setDup({ kind: 'exists', hymn: data.hymn });
      } else if (data.relistable) {
        setDup({ kind: 'relistable', hymn: data.hymn });
        // relist 都可以即場改埋 metadata,預填現有值方便直接確認。
        setPreview({
          youtube_id: data.hymn.youtube_id,
          title: data.hymn.title,
          display_title: data.hymn.display_title || data.hymn.title,
          artist: data.hymn.artist || '',
          category: data.hymn.category || '',
          lang: data.hymn.lang || '粵語',
          album: data.hymn.album || '',
          title_en: data.hymn.title_en || '',
          duration: null,
          warnings: [],
        });
      } else {
        setPreview({
          youtube_id: data.youtube_id,
          title: data.title,
          display_title: data.display_title,
          artist: data.channel || '',
          category: '',
          lang: '粵語',
          album: '',
          title_en: '',
          duration: data.duration,
          warnings: data.warnings || [],
        });
      }
    } catch (e) {
      if (e.code === 'bad_url') setError('唔係有效嘅 YouTube 連結');
      else if (e.code === 'metadata_failed') setError('攞唔到片段資料,可能已下架或者連結唔啱');
      else if (e.code === 'rate_limited') setError('查得太密,等一陣先');
      else setError(e.message || '查詢失敗');
    }
    setChecking(false);
  }, [url, getToken, reset]);

  const setField = (key, value) => setPreview((p) => ({ ...p, [key]: value }));

  const confirm = useCallback(async () => {
    if (!preview) return;
    setSubmitting(true); setError('');
    try {
      const token = getToken();
      const fields = {
        youtube_id: preview.youtube_id,
        title: preview.title,
        display_title: preview.display_title,
        artist: preview.artist,
        category: preview.category,
        lang: preview.lang,
        album: preview.album,
        title_en: preview.title_en,
      };
      if (Number.isFinite(preview.duration)) fields.duration = preview.duration;
      const { dataVersion } = await adminAddHymn(token, fields);
      notifyHymnsChanged(dataVersion);
      setSuccess(true);
    } catch (e) {
      if (e.code === 'db_busy') setError('背景維護行緊,一陣再試');
      else if (e.code === 'resolve_failed') setError('拎唔到音訊,呢條片可能有問題');
      else if (e.code === 'already_curated') setError('已經喺庫,唔使再加');
      else setError(e.message || '入庫失敗');
    }
    setSubmitting(false);
  }, [preview, getToken]);

  const field = (key, label, opts = {}) => (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={preview[key]}
        onChangeText={(v) => setField(key, v)}
        placeholder={opts.placeholder || ''}
        placeholderTextColor={COLORS.textSecondary}
        maxLength={200}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="close" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>貼連結加歌</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={styles.urlRow}>
          <TextInput
            style={styles.urlInput}
            value={url}
            onChangeText={setUrl}
            placeholder="貼 YouTube 連結"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TouchableOpacity style={styles.checkBtn} onPress={check} disabled={checking || !url.trim()} activeOpacity={0.8}>
            {checking ? <ActivityIndicator size="small" color={COLORS.background} /> : <Text style={styles.checkBtnText}>查</Text>}
          </TouchableOpacity>
        </View>

        {!!error && <Text style={styles.errText}>{error}</Text>}

        {dup?.kind === 'exists' && (
          <View style={styles.infoBanner}>
            <MaterialIcons name="info-outline" size={18} color={COLORS.accent} />
            <Text style={styles.infoBannerText}>已經喺庫:「{dup.hymn.display_title || dup.hymn.title}」</Text>
          </View>
        )}

        {success && (
          <View style={styles.successBanner}>
            <MaterialIcons name="check-circle" size={18} color={COLORS.accent} />
            <Text style={styles.successBannerText}>已入庫,詩歌庫即刻搵到</Text>
          </View>
        )}

        {preview && !success && (
          <View style={styles.previewCard}>
            {dup?.kind === 'relistable' && (
              <View style={styles.infoBanner}>
                <MaterialIcons name="info-outline" size={18} color={COLORS.accent} />
                <Text style={styles.infoBannerText}>之前落咗架,確認會重新上架</Text>
              </View>
            )}
            <Text style={styles.originalTitleLabel}>原始 YouTube 標題</Text>
            <Text style={styles.originalTitleText} numberOfLines={2}>{preview.title}</Text>

            {preview.warnings.length > 0 && (
              <View style={styles.warnBanner}>
                {preview.warnings.map((w, i) => (
                  <Text key={i} style={styles.warnText}>⚠️ {w}</Text>
                ))}
              </View>
            )}

            {field('display_title', '顯示歌名')}
            {field('artist', '團體')}

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>分類</Text>
              <View style={styles.chipRow}>
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <TouchableOpacity key={c} style={[styles.chip, preview.category === c && styles.chipActive]}
                    onPress={() => setField('category', c)} activeOpacity={0.7}>
                    <Text style={[styles.chipText, preview.category === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.fieldInput}
                value={preview.category}
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
                  <TouchableOpacity key={l} style={[styles.chip, preview.lang === l && styles.chipActive]}
                    onPress={() => setField('lang', l)} activeOpacity={0.7}>
                    <Text style={[styles.chipText, preview.lang === l && styles.chipTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {field('album', '專輯', { placeholder: '(可留空)' })}
            {field('title_en', '英文名', { placeholder: '(可留空)' })}

            {Number.isFinite(preview.duration) && (
              <Text style={styles.durationText}>片長:{Math.floor(preview.duration / 60)}:{String(preview.duration % 60).padStart(2, '0')}</Text>
            )}

            <TouchableOpacity style={styles.confirmBtn} onPress={confirm} disabled={submitting} activeOpacity={0.8}>
              {submitting ? <ActivityIndicator size="small" color={COLORS.background} /> : (
                <Text style={styles.confirmBtnText}>確認入庫</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  headerTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '700' },
  urlRow: { flexDirection: 'row', alignItems: 'center' },
  urlInput: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, height: 48,
    color: COLORS.textPrimary, fontSize: 15, borderWidth: 1, borderColor: COLORS.border, marginRight: 10,
  },
  checkBtn: {
    backgroundColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 20, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 15 },
  errText: { color: COLORS.danger, fontSize: 13, marginTop: 12 },
  infoBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 10, padding: 12, marginTop: 14,
  },
  infoBannerText: { color: COLORS.textPrimary, fontSize: 13, marginLeft: 8, flex: 1 },
  successBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 10, padding: 14, marginTop: 14, borderWidth: 1, borderColor: COLORS.accent,
  },
  successBannerText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', marginLeft: 8 },
  previewCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginTop: 14 },
  originalTitleLabel: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 4 },
  originalTitleText: { color: COLORS.textPrimary, fontSize: 14, marginBottom: 12 },
  warnBanner: {
    backgroundColor: '#3A3320', borderRadius: 10, padding: 10, marginBottom: 14,
    borderWidth: 1, borderColor: '#E8B86D',
  },
  warnText: { color: '#E8B86D', fontSize: 13, marginBottom: 2 },
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
  durationText: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 14 },
  confirmBtn: {
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  confirmBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 16 },
});
