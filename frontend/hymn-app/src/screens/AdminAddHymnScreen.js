// AdminAddHymnScreen — 「URL加歌」(MYPAGE-ADMIN-CHIPS-PLAN §五)
//
// 舊版流程:貼 URL → 撳「查」→ 出 preview 卡 →「確認入庫」。
// 呢版改:貼 URL 即刻(零 API)顯示縮圖 → debounce 600ms 之後 auto-trigger
// preview(同一個 videoId 只 fire 一次,拆走「查」掣)→ 縮圖大圖→片名→頻道名
// →現有可編輯欄位(exists/relistable/422 邏輯全部保留唔郁)。下面加「我加過
// 嘅歌」list,顯示已存入庫/已上架狀態,confirm 成功後 refresh。

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useInsets } from '../hooks/useInsets';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';
import { adminPreviewHymn, adminAddHymn, adminListAddedHymns, adminErrorMessage } from '../api';
import { notifyHymnsChanged } from '../hooks/useCachedHymns';
import { getDisplayTitle } from '../utils/displayTitle';

const CATEGORY_SUGGESTIONS = ['詩歌', '粵語', '國語', '兒童'];
const LANG_OPTIONS = ['粵語', '國語', '英文', '兒童'];

// 照抄 backend routes/admin.js:74 個 regex(watch?v= / youtu.be/ / shorts/
// 三款,11 字元 id)——前端要即刻(唔等 API)由 URL 抽 id 出縮圖。
const VIDEO_ID_IN_URL_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/;
function extractVideoId(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(VIDEO_ID_IN_URL_RE);
  return m ? m[1] : null;
}

const PREVIEW_DEBOUNCE_MS = 600;

function BigThumb({ videoId }) {
  const [failed, setFailed] = useState(false);
  // videoId 變咗要重試新縮圖(舊版 failed 唔會自動清)。
  useEffect(() => { setFailed(false); }, [videoId]);
  const uri = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={[styles.bigThumb, styles.bigThumbFallback]}>
        <MaterialIcons name="music-note" size={40} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={styles.bigThumb} onError={() => setFailed(true)} />;
}

function Cover({ youtubeId, size = 48 }) {
  const [failed, setFailed] = useState(false);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={[styles.cover, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }]}>
        <MaterialIcons name="music-note" size={size * 0.5} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.cover, { width: size, height: size }]} onError={() => setFailed(true)} />;
}

// 細 pill badge(§5.2:fontSize 11、paddingH 8、paddingV 2、borderRadius 8、
// 1px 邊框),tone 揀顏色,唔好搶咗歌名戲。
function Badge({ label, tone }) {
  const color = tone === 'accent' ? COLORS.accent : tone === 'danger' ? COLORS.danger : COLORS.textSecondary;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export default function AdminAddHymnScreen({ onClose }) {
  const insets = useInsets();
  const { getToken } = useAuth();
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState(null); // 即時 derive,唔等 debounce/API
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // yt-dlp metadata + warnings,可編輯
  const [dup, setDup] = useState(null); // { kind: 'exists'|'relistable', hymn }
  const [success, setSuccess] = useState(false);

  const [added, setAdded] = useState([]);
  const [addedLoading, setAddedLoading] = useState(false);

  const firedIdRef = useRef(null); // 邊個 videoId 已經 fire 過 preview,避免重複 call
  const debounceRef = useRef(null);

  const reset = useCallback(() => {
    setPreview(null); setDup(null); setError(''); setSuccess(false);
  }, []);

  const loadAdded = useCallback(async () => {
    setAddedLoading(true);
    try {
      const token = getToken();
      const items = await adminListAddedHymns(token);
      setAdded(items || []);
    } catch (e) {
      // 讀「我加過嘅歌」失敗唔阻主流程(貼 link 加歌),靜靜哋保留舊資料。
    }
    setAddedLoading(false);
  }, [getToken]);

  useEffect(() => { loadAdded(); }, [loadAdded]);

  const runPreview = useCallback(async (id, rawUrl) => {
    reset();
    setChecking(true);
    try {
      const token = getToken();
      const data = await adminPreviewHymn(token, rawUrl);
      if (data.exists) {
        setDup({ kind: 'exists', hymn: data.hymn });
      } else if (data.relistable) {
        setDup({ kind: 'relistable', hymn: data.hymn });
        // relist 都可以即場改埋 metadata,預填現有值方便直接確認。
        setPreview({
          youtube_id: data.hymn.youtube_id,
          title: data.hymn.title,
          channel: '', // relist 冇獨立 channel 記錄,唔重覆顯示「團體」欄已有嘅值
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
          channel: data.channel || '',
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
      else setError(adminErrorMessage(e, '查詢失敗'));
    }
    setChecking(false);
  }, [getToken, reset]);

  // 貼 link 即刻(零 API)顯示縮圖;debounce 600ms 之後先 auto-trigger
  // preview,同一個 videoId 只 fire 一次(§5.1)。
  useEffect(() => {
    const id = extractVideoId(url);
    setVideoId(id);
    if (!id) {
      reset();
      firedIdRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (firedIdRef.current === id) return;
      firedIdRef.current = id;
      runPreview(id, url);
    }, PREVIEW_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const retry = useCallback(() => {
    if (!videoId) return;
    firedIdRef.current = videoId;
    runPreview(videoId, url);
  }, [videoId, url, runPreview]);

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
      loadAdded(); // 閉環:「我加過嘅歌」refresh,嗰首即刻以已存入庫+已上架姿態出現
    } catch (e) {
      if (e.code === 'resolve_failed') setError('拎唔到音訊,呢條片可能有問題');
      else if (e.code === 'already_curated') setError('已經喺庫,唔使再加');
      else setError(adminErrorMessage(e, '入庫失敗'));
    }
    setSubmitting(false);
  }, [preview, getToken, loadAdded]);

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
        <Text style={styles.headerTitle}>URL加歌</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
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

        {videoId && (
          <View style={styles.previewCard}>
            <BigThumb videoId={videoId} />

            {checking && !preview && !dup && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text style={styles.loadingText}>攞緊片段資料⋯</Text>
              </View>
            )}

            {!!error && (
              <View style={styles.errRow}>
                <Text style={styles.errText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={retry} activeOpacity={0.8}>
                  <Text style={styles.retryBtnText}>重試</Text>
                </TouchableOpacity>
              </View>
            )}

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
              <>
                {dup?.kind === 'relistable' && (
                  <View style={styles.infoBanner}>
                    <MaterialIcons name="info-outline" size={18} color={COLORS.accent} />
                    <Text style={styles.infoBannerText}>之前落咗架,確認會重新上架</Text>
                  </View>
                )}

                <Text style={styles.previewTitle} numberOfLines={2}>{preview.title}</Text>
                {!!preview.channel && <Text style={styles.previewChannel} numberOfLines={1}>{preview.channel}</Text>}
                <View style={styles.notStoredRow}>
                  <Badge label="未存" tone="neutral" />
                </View>

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
              </>
            )}
          </View>
        )}

        {/* 「我加過嘅歌」——preview 卡出現緊(貼咗有效 link)嗰陣收埋,同縮圖卡
            撞版面(§5.2)。 */}
        {!videoId && (
          <View style={styles.addedSection}>
            <Text style={styles.addedTitle}>我加過嘅歌</Text>
            {addedLoading ? (
              <View style={styles.addedLoadingWrap}>
                <ActivityIndicator size="small" color={COLORS.accent} />
              </View>
            ) : added.length === 0 ? (
              <Text style={styles.addedEmpty}>仲未加過歌,貼個 YouTube 連結試下</Text>
            ) : (
              added.map((item) => (
                <View key={item.hymn ? item.hymn.id : item.acted_at} style={styles.addedRow}>
                  <Cover youtubeId={item.hymn?.youtube_id} />
                  <View style={styles.addedRowInfo}>
                    <Text style={styles.addedRowTitle} numberOfLines={1}>{getDisplayTitle(item.hymn)}</Text>
                    <Text style={styles.addedRowArtist} numberOfLines={1}>{item.hymn?.artist || '未知'}</Text>
                    <View style={styles.addedBadgeRow}>
                      <Badge label={item.in_library ? '已存入庫' : '未存'} tone={item.in_library ? 'accent' : 'neutral'} />
                      <Badge label={item.listed ? '已上架' : '未上架'} tone={item.listed ? 'accent' : 'danger'} />
                    </View>
                  </View>
                </View>
              ))
            )}
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
  urlInput: {
    backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, height: 48,
    color: COLORS.textPrimary, fontSize: 15, borderWidth: 1, borderColor: COLORS.border,
  },
  bigThumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: COLORS.cardLight, marginBottom: 12 },
  bigThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  loadingText: { color: COLORS.textSecondary, fontSize: 13, marginLeft: 8 },
  errRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  errText: { color: COLORS.danger, fontSize: 13, flex: 1, marginRight: 12 },
  retryBtn: {
    backgroundColor: COLORS.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  retryBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
  infoBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 10,
  },
  infoBannerText: { color: COLORS.textPrimary, fontSize: 13, marginLeft: 8, flex: 1 },
  successBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: 10, padding: 14, marginTop: 4, borderWidth: 1, borderColor: COLORS.accent,
  },
  successBannerText: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', marginLeft: 8 },
  previewCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginTop: 14 },
  previewTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  previewChannel: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 8 },
  notStoredRow: { flexDirection: 'row', marginBottom: 12 },
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
  // 「我加過嘅歌」(§5.2)
  addedSection: { marginTop: 22 },
  addedTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 10 },
  addedLoadingWrap: { paddingVertical: 20, alignItems: 'center' },
  addedEmpty: { color: COLORS.textSecondary, fontSize: 13, paddingVertical: 8 },
  addedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight },
  addedRowInfo: { flex: 1, marginLeft: 12 },
  addedRowTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' },
  addedRowArtist: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  addedBadgeRow: { flexDirection: 'row', marginTop: 6 },
  // 細 pill badge(§5.2)
  badge: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
    marginRight: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
});
