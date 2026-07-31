// 詩歌庫 —— REDESIGN-PLAN §2.2「全部詩歌,可以按語言/歌手/專輯篩選」
// 2026-07 SEARCH-MERGE-PLAN:獨立「搜尋」分頁已併入本頁 —— 搜尋欄喺標題下、
// 語言 chip 上,本地即時 filter(歌名/英文名/歌手/歌詞/專輯),同 chip AND 夾用。
//
// 呢個 tab 係新嘅(舊版冇)。而家個庫係 Phase 2 揀出嚟嘅 150 首試版歌
// (backend 個 `hymns` view 已經幫我哋隱藏咗死鏈同非 curated 嘅歌),
// 所以呢度收到咩就顯示咩,唔使前端再過濾一次。

import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Image, Keyboard } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { useFavorites } from '../context/FavoritesContext';
import { useAddToPlaylist } from '../components/AddToPlaylistSheet';
import { useAdminEditHymn } from '../components/AdminEditHymnSheet';
import { useAuth } from '../context/AuthContext';
import { getDisplayTitle } from '../utils/displayTitle';

const LANGS = ['全部', '粵語', '國語', '英文', '兒童'];

// 搜尋 normalize —— 剩返字母/數字/CJK,咁「神, 我屬祢!」呢類標點先唔會拆散
// query 同歌名嘅比對(Eric 實測「神我屬」搵唔到,SUPERVISION-LOG 2026-07-27 17:30)。
const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// 同播放清單 / 歌單頁一致:喺清單度直接加最愛,唔使入返播放頁(款式照搬 HymnListScreen)
function Heart({ hymn }) {
  const { isFavorite, toggleFavorite } = useFavorites() || {};
  if (!hymn?.id || typeof toggleFavorite !== 'function') return null;
  const on = typeof isFavorite === 'function' ? isFavorite(hymn.id) : false;
  return (
    <TouchableOpacity
      onPress={(e) => { e?.stopPropagation?.(); toggleFavorite(hymn); }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={styles.heart}
      activeOpacity={0.6}
    >
      <MaterialIcons
        name={on ? 'favorite' : 'favorite-border'}
        size={20}
        color={on ? COLORS.accent : COLORS.textSecondary}
      />
    </TouchableOpacity>
  );
}

function Cover({ youtubeId, size = 52 }) {
  const [failed, setFailed] = useState(false);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    // §5.4 唔用 Emoji 做 fallback,用向量圖標
    return (
      <View style={[styles.cover, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }]}>
        <MaterialIcons name="music-note" size={size * 0.5} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.cover, { width: size, height: size }]} onError={() => setFailed(true)} />;
}

export default function LibraryScreen({ hymns = [], onPlayHymn }) {
  const [lang, setLang] = useState('全部');
  const [artist, setArtist] = useState(null);
  // SEARCH-MERGE-PLAN:搜尋欄併入本頁,本地即時 filter,同 chip AND 夾用
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  // 每首歌嘅 normalize 結果淨係喺 hymns 陣列變嗰陣先重算一次(1500+ 首每下
  // 撳鍵都行 5 個 regex 會拖慢),之後搜尋淨係一個字串 includes。
  const augmented = useMemo(() => hymns.map((h) => ({
    ...h,
    // 每欄 || '' 兜底:離線舊 cache 可能未有 album/title_en(SEARCH-MERGE-PLAN §5)
    _searchBlob: norm(h.title) + norm(h.title_en) + norm(h.artist) + norm(h.album) + norm(h.lyrics),
  })), [hymns]);

  // Filter 鏈:全庫 → 語言 chip → 搜尋字串 → 歌手 chip(AND)。
  // 歌手 chip 嘅計數 base 跟埋語言+搜尋重算,所以搜尋層放喺歌手層之前。
  const searched = useMemo(() => {
    let base = lang === '全部' ? augmented : augmented.filter((h) => h.lang === lang);
    const nq = norm(query);
    if (!nq) return base;
    return base.filter((h) => h._searchBlob.includes(nq));
  }, [augmented, lang, query]);

  const artists = useMemo(() => {
    const counts = {};
    searched.forEach((h) => { const a = h.artist || '未知'; counts[a] = (counts[a] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [searched]);

  const shown = useMemo(() => {
    if (!artist) return searched;
    return searched.filter((h) => (h.artist || '未知') === artist);
  }, [searched, artist]);

  const hasQuery = query.trim().length > 0;
  const hasChipFilter = lang !== '全部' || !!artist;
  // B11 修 —— 之前唔理 hasChipFilter,搜尋撞 0 個結果一律話「搵唔到「Chris」/
  // 試下其他關鍵字」,但歌手 chip(例如「ACM 21」)已經 scroll 出咗畫面,用戶
  // 見唔到仲揀緊邊個歌手,以為個關鍵字真係冇貨(其實清埋篩選就有 12 首)。
  // 呢個 App 嘅 chip 本身設計成同搜尋 AND 埋一齊用(`shown` = searched 再過
  // 一次 artist),所以唔改做「打字就自動清 chip」(方案 a)—— 咁樣就同 chip
  // 原本「揀個歌手嘅範圍再搵」嘅意圖相反。改用方案 b:老實話明係邊個篩選
  // 令結果空,「清除篩選」掣照用(已經識埋 lang+artist 一齊清)。
  const filterLabel = [lang !== '全部' ? lang : null, artist].filter(Boolean).join(' · ');
  const { open: openAddToPlaylist } = useAddToPlaylist();
  // admin long-press 入口(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7)—— member 冇呢個
  // onLongPress prop,UI 層面完全見唔到(API 有 requireAdmin 403 兜底)。
  const { isAdmin } = useAuth() || {};
  const { open: openAdminEdit } = useAdminEditHymn();

  // edge-to-edge:唔加 top inset 個大字標題會同狀態列時間疊埋(見 useInsets.js)
  const insets = useInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.header}>詩歌庫</Text>
      <Text style={styles.count}>{shown.length} 首</Text>

      {/* 搜尋欄(SEARCH-MERGE-PLAN §3)— 喺固定 header 區內,自動 pinned 唔跟 scroll */}
      <View style={[styles.searchWrap, focused && styles.searchWrapFocused]}>
        <MaterialIcons name="search" size={20} color={COLORS.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜尋歌名、歌手、歌詞、專輯"
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => Keyboard.dismiss()}
          returnKeyType="search"
        />
        {hasQuery && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => setQuery('')}>
            <MaterialIcons name="close" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* 語言篩選 */}
      <View style={styles.chipRow}>
        {LANGS.map((l) => (
          <TouchableOpacity
            key={l}
            style={[styles.chip, lang === l && styles.chipActive]}
            onPress={() => { setLang(l); setArtist(null); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, lang === l && styles.chipTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 歌手篩選(橫向) */}
      <View style={styles.artistWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[['全部歌手', shown.length], ...artists]}
          keyExtractor={(item) => String(item[0])}
          renderItem={({ item }) => {
            const [name, n] = item;
            const isAll = name === '全部歌手';
            const active = isAll ? !artist : artist === name;
            return (
              <TouchableOpacity
                style={[styles.artistChip, active && styles.artistChipActive]}
                onPress={() => setArtist(isAll ? null : name)}
                activeOpacity={0.7}
              >
                <Text style={[styles.artistChipText, active && styles.artistChipTextActive]} numberOfLines={1}>
                  {name}{isAll ? '' : ` ${n}`}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        data={shown}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        renderItem={({ item }) => (
          // 2026-07-30 Eric 三場景規格(QUEUE-BEHAVIOR-3-SCENARIOS-PLAN)推翻
          // BUG3(a):瀏覽撳歌 = 單曲 + 30 首類似尾巴(playSingle 條路);想聽
          // 成個分類用「播晒 N 首」掣或者「睇晒」頁。播緊清單時撳呢度依然係
          // 插播——由 playSingle 自己嘅插播分支處理,唔再需要 browseTap flag。
          <TouchableOpacity
            style={styles.row}
            onPress={() => onPlayHymn && onPlayHymn(item)}
            onLongPress={isAdmin ? () => openAdminEdit(item) : undefined}
            activeOpacity={0.7}
          >
            <Cover youtubeId={item.youtube_id} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowTitle} numberOfLines={2}>{getDisplayTitle(item)}</Text>
              <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || '未知'} · {item.lang}</Text>
            </View>
            {/* ≡♪ 加入到清單 + 心心 —— 同 HymnListScreen / 播放清單 sheet 行尾一致;
                成行撳落去照舊播歌,所以唔再需要裝飾性 play-arrow */}
            <TouchableOpacity
              onPress={(e) => { e?.stopPropagation?.(); openAddToPlaylist(item); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.rowAction}
              activeOpacity={0.6}
            >
              <MaterialIcons name="playlist-add" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <Heart hymn={item} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name={hasQuery ? 'search-off' : 'library-music'} size={40} color={COLORS.textSecondary} />
            {hasQuery ? (
              hasChipFilter ? (
                <>
                  <Text style={styles.emptyText}>喺「{filterLabel}」入面搵唔到「{query.trim()}」</Text>
                  <Text style={styles.emptyHint}>清埋篩選再搵下成個詩歌庫</Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyText}>搵唔到「{query.trim()}」</Text>
                  <Text style={styles.emptyHint}>試下其他關鍵字</Text>
                </>
              )
            ) : (
              <Text style={styles.emptyText}>冇歌</Text>
            )}
            {/* 有 chip filter 生效時俾個掣一撳重置,免得用戶唔知係 chip 累事 */}
            {hasChipFilter && (
              <TouchableOpacity style={styles.clearFilterBtn} onPress={() => { setLang('全部'); setArtist(null); }} activeOpacity={0.7}>
                <Text style={styles.clearFilterText}>清除篩選</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { ...TYPOGRAPHY.title, paddingHorizontal: 16 },
  count: { ...TYPOGRAPHY.artist, paddingHorizontal: 16, marginTop: 2, marginBottom: 10 },
  // 搜尋欄 — 樣式跟舊 SearchScreen 嘅藥丸形睇齊
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#E8E8E8', borderRadius: 24,
    marginHorizontal: 16, paddingHorizontal: 16,
    height: 48, marginBottom: 10,
  },
  searchWrapFocused: { borderWidth: 2, borderColor: COLORS.accent },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: '#0B0F0E', height: 48 },
  clearBtn: { padding: 4 },
  chipRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 16,
    backgroundColor: COLORS.card, marginRight: 8,
  },
  chipActive: { backgroundColor: COLORS.accent },
  chipText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  chipTextActive: { color: COLORS.background },
  artistWrap: { paddingLeft: 16, marginBottom: 10 },
  artistChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, marginRight: 8, maxWidth: 150,
  },
  artistChipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.card },
  artistChipText: { fontSize: 12, color: COLORS.textSecondary },
  artistChipTextActive: { color: COLORS.accent, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },   // §5.3 列表 18pt
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  rowAction: { paddingLeft: 14 },
  heart: { paddingLeft: 14 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.artist, marginTop: 8 },
  emptyHint: { fontSize: 13, color: '#666', marginTop: 6 },
  clearFilterBtn: {
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 18, borderWidth: 1, borderColor: COLORS.accent,
  },
  clearFilterText: { fontSize: 14, color: COLORS.accent, fontWeight: '600' },
});
