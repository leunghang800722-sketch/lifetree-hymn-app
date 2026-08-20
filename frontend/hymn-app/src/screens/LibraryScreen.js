// 詩歌庫 —— REDESIGN-PLAN §2.2「全部詩歌,可以按語言/歌手/專輯篩選」
// 2026-07 SEARCH-MERGE-PLAN:獨立「搜尋」分頁已併入本頁 —— 搜尋欄喺標題下、
// 語言 chip 上,本地即時 filter(歌名/英文名/歌手/歌詞/專輯),同 chip AND 夾用。
//
// 呢個 tab 係新嘅(舊版冇)。而家個庫係 Phase 2 揀出嚟嘅 150 首試版歌
// (backend 個 `hymns` view 已經幫我哋隱藏咗死鏈同非 curated 嘅歌),
// 所以呢度收到咩就顯示咩,唔使前端再過濾一次。

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Image, Keyboard, InteractionManager } from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import { COLORS, TYPOGRAPHY, effects } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { useFavorites } from '../context/FavoritesContext';
import { useAddToPlaylist } from '../components/AddToPlaylistSheet';
import { useAdminEditHymn } from '../components/AdminEditHymnSheet';
import { useAuth } from '../context/AuthContext';
import AvatarButton from '../components/AvatarButton';
import { getDisplayTitle } from '../utils/displayTitle';

const LANGS = ['全部', '粵語', '國語', '英文', '兒童'];
// 兒童 tab 內語言 sub-chips 嘅顯示次序(TAXONOMY-5D-PLAN §4.2,Eric 補充拍板)。
const KIDS_SUB_LANGS = ['粵語', '國語', '英文'];

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
      <OdeIcon
        name="heart"
        size={20}
        filled={on}
        color={on ? COLORS.primary : COLORS.textSecondary}
      />
    </TouchableOpacity>
  );
}

function Cover({ youtubeId, size = 52 }) {
  const [failed, setFailed] = useState(false);
  // youtubeId 變咗要重試新縮圖(舊版 failed 唔會自動清,BATCH5 S6)。
  useEffect(() => { setFailed(false); }, [youtubeId]);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    // §5.4 唔用 Emoji 做 fallback,用向量圖標
    return (
      <View style={[styles.cover, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }]}>
        <OdeIcon name="musicNote" size={size * 0.5} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.cover, { width: size, height: size }]} onError={() => setFailed(true)} />;
}

export default function LibraryScreen({ hymns = [], onPlayHymn, onOpenAuth }) {
  const [lang, setLang] = useState('全部');
  const [org, setOrg] = useState(null);
  // 兒童 tab 內語言 sub-chips(TAXONOMY-5D-PLAN §4.2)—— 淨喺 lang==='兒童' 時生效。
  const [kidsSubLang, setKidsSubLang] = useState('全部');
  // SEARCH-MERGE-PLAN:搜尋欄併入本頁,本地即時 filter,同 chip AND 夾用
  // BATCH5 O4:queryInput 係 TextInput 即時值(clear 掣/hasQuery 用佢);
  // query 係 debounce 200ms 之後先更新,searched/orgs/filterLabel 用呢個,
  // 打字嗰陣唔會每個 keystroke 都重算成個庫嘅 filter。
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput), 200);
    return () => clearTimeout(t);
  }, [queryInput]);
  const [focused, setFocused] = useState(false);

  // BATCH5 O3:唔再 clone 成個 hymns 陣列(6232 個 object 嘅 _searchBlob 令
  // 每次 hymns 變都要重造六千幾個 object)。改起一個 side index(id → blob),
  // 落游全部改用原始 hymns 陣列,filter 改讀 blobIndex.get(h.id)。
  // 主輪 blob 唔再包 norm(h.lyrics)——歌詞搜尋變第二輪 lazy fallback(見下面
  // lyricsIndexRef),733KB 全文 join 唔使每次 hymns 變就重掃一次。
  const blobIndex = useMemo(() => {
    const m = new Map();
    for (const h of hymns) {
      // display_title 一定要包——admin 改歌名(MEMBERSHIP-PHASE2-ADMIN-PLAN)改嘅
      // 正正係呢個欄位(唔係原始 title),漏咗就會出現「改咗個名之後用新名反而
      // 搵唔到」(Opus 5 驗收揪出)。每欄 || '' 兜底:離線舊 cache 可能未有
      // album/title_en/performer(SEARCH-MERGE-PLAN §5、TAXONOMY-5D-PLAN §4.2 同一鐵律)。
      m.set(h.id, norm(h.title) + norm(h.display_title) + norm(h.title_en) + norm(h.artist) + norm(h.album) + norm(h.performer));
    }
    return m;
  }, [hymns]);

  // 歌詞搜尋 lazy index:一個 hymns reference 只起一次(對照 src `hymns` identity),
  // 每次有 query 都同標題輪一齊搵(F6 regression fix,唔再係得 0 命中先用嘅
  // fallback)。733KB 總量,起一次之後每 keystroke 只係 Map.get + includes,
  // 冇 regex——所以兩輪一齊搵都仲係平。
  const lyricsIndexRef = useRef({ src: null, map: null });
  function buildLyricsIndex(list) {
    const m = new Map();
    for (const h of list) { if (h.lyrics) m.set(h.id, norm(h.lyrics)); }
    return m;
  }
  function getLyricsIndex(list) {
    if (lyricsIndexRef.current.src !== list) {
      lyricsIndexRef.current = { src: list, map: buildLyricsIndex(list) };
    }
    return lyricsIndexRef.current.map;
  }

  // BATCH7 B7-10:淨係靠上面 getLyricsIndex() 喺第一下搜尋嘅 render 入面先起,
  // 會喺用戶打緊字嗰下主線程 stall 一下(norm() ~6k 首全歌詞,733KB;
  // SECOND-PASS-REVIEW-20260820.md f5)。用 InteractionManager 喺 hymns
  // 準備好、冇 interaction 進行緊嗰陣背景預起,用戶真正搜嗰刻多數已經現成。
  // 上面 getLyricsIndex() 嘅 lazy fallback 冚唔變——萬一預起未完成(hymns
  // 啱啱先載入完、用戶手快)都保證行為正確,唔會因為呢個優化搜漏歌詞。
  useEffect(() => {
    if (!hymns.length) return undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      getLyricsIndex(hymns);
    });
    return () => task.cancel && task.cancel();
  }, [hymns]);

  // 兒童分類嘅底庫(唔理搜尋/團體篩選)——兼容讀法:kids===1 或者舊 client 冇
  // kids 欄時嘅 lang==='兒童' 分支(§4.2)。用嚟計 sub-chips 動態出現同計數。
  const kidsBase = useMemo(
    () => hymns.filter((h) => h.kids === 1 || h.lang === '兒童'),
    [hymns]
  );
  const kidsSubLangs = useMemo(() => {
    const counts = {};
    kidsBase.forEach((h) => {
      if (KIDS_SUB_LANGS.includes(h.real_lang)) counts[h.real_lang] = (counts[h.real_lang] || 0) + 1;
    });
    return KIDS_SUB_LANGS.filter((l) => counts[l] > 0).map((l) => [l, counts[l]]);
  }, [kidsBase]);

  // C2 驗收觀察Ⓑ(TAXONOMY-5D-PLAN §8 C3):sub-chips 係按實際數據動態生成,
  // 揀緊嘅 kidsSubLang 有可能因為數據變動(例如 C4 換血改咗 real_lang 分佈)
  // 而喺 kidsSubLangs 度消失 —— 冇呢個 effect 嘅話 kidsSubLang 會變成一個
  // 隱形篩選(UI 冇粒 chip 顯示揀緊,但 `searched` 仍然用緊佢嗰個舊值 filter,
  // 用戶會見到「莫名其妙」少咗結果)。一發現揀緊嘅值唔喺現有 sub-chip 集合
  // 入面就重置返「全部」。
  useEffect(() => {
    if (kidsSubLang !== '全部' && !kidsSubLangs.some(([l]) => l === kidsSubLang)) {
      setKidsSubLang('全部');
    }
  }, [kidsSubLangs, kidsSubLang]);

  // Filter 鏈(§4.2):全庫 → 語言 chip(兒童讀 kids 兼容分支)→ 兒童 sub-lang
  // (real_lang)→ 搜尋字串 → 團體 chip(AND)。團體 chip 嘅計數 base 跟埋
  // 語言+sub-lang+搜尋重算,所以搜尋層放喺團體層之前。
  const searched = useMemo(() => {
    let base;
    if (lang === '兒童') {
      base = kidsBase;
      if (kidsSubLang !== '全部') base = base.filter((h) => h.real_lang === kidsSubLang);
    } else if (lang === '全部') {
      base = hymns;
    } else {
      base = hymns.filter((h) => h.lang === lang);
    }
    const nq = norm(query);
    if (!nq) return base;
    // F6 regression fix(Opus 5 驗收揪出,Eric 拍板):唔再用「標題有命中就唔搵
    // 歌詞」嘅 fallback —— 呢個做法會令「淨記得歌詞、唔記得歌名」嘅搜尋完全
    // 搵唔返首歌(例如「主耶穌我愛祢」標題命中 2 首,《深深愛慕祢》淨係歌詞
    // 命中,舊邏輯就消失咗)。改做兩輪都搜、結果 merge:標題/歌手/專輯命中
    // 排前面,歌詞命中排後面;兩輪都中嘅歌只計標題組,唔重複出。
    const titleHits = base.filter((h) => (blobIndex.get(h.id) || '').includes(nq));
    const titleHitIds = new Set(titleHits.map((h) => h.id));
    const lyricsMap = getLyricsIndex(hymns);
    const lyricsOnlyHits = base.filter(
      (h) => !titleHitIds.has(h.id) && (lyricsMap.get(h.id) || '').includes(nq)
    );
    return [...titleHits, ...lyricsOnlyHits];
  }, [hymns, kidsBase, lang, kidsSubLang, query, blobIndex]);

  // 第二行 chips:歌手 → 團體(拍板 ✓)。data source h.org || h.artist——離線舊
  // cache 冇 org 欄就兜底用返 artist(§4.2)。
  const orgs = useMemo(() => {
    const counts = {};
    searched.forEach((h) => { const o = h.org || h.artist || '未知'; counts[o] = (counts[o] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [searched]);

  const shown = useMemo(() => {
    if (!org) return searched;
    return searched.filter((h) => (h.org || h.artist || '未知') === org);
  }, [searched, org]);

  const hasQuery = queryInput.trim().length > 0;
  // C2 驗收觀察Ⓒ(TAXONOMY-5D-PLAN §8 C3):原本仲有 `|| (lang==='兒童' &&
  // kidsSubLang!=='全部')` 一截,但 lang==='兒童' 本身已經令 `lang!=='全部'`
  // 成立,呢截係恆真嘅死碼,冚咗唔改行為,淨係清走。
  const hasChipFilter = lang !== '全部' || !!org;
  // B11 修 —— 之前唔理 hasChipFilter,搜尋撞 0 個結果一律話「搵唔到「Chris」/
  // 試下其他關鍵字」,但歌手 chip(例如「ACM 21」)已經 scroll 出咗畫面,用戶
  // 見唔到仲揀緊邊個歌手,以為個關鍵字真係冇貨(其實清埋篩選就有 12 首)。
  // 呢個 App 嘅 chip 本身設計成同搜尋 AND 埋一齊用(`shown` = searched 再過
  // 一次 org),所以唔改做「打字就自動清 chip」(方案 a)—— 咁樣就同 chip
  // 原本「揀個團體嘅範圍再搵」嘅意圖相反。改用方案 b:老實話明係邊個篩選
  // 令結果空,「清除篩選」掣照用(已經識埋 lang+org+kidsSubLang 一齊清)。
  const filterLabel = [
    lang !== '全部' ? lang : null,
    lang === '兒童' && kidsSubLang !== '全部' ? kidsSubLang : null,
    org,
  ].filter(Boolean).join(' · ');
  const { open: openAddToPlaylist } = useAddToPlaylist();
  // admin long-press 入口(MEMBERSHIP-PHASE2-ADMIN-PLAN §3.7)—— member 冇呢個
  // onLongPress prop,UI 層面完全見唔到(API 有 requireAdmin 403 兜底)。
  const { isAdmin } = useAuth() || {};
  const { open: openAdminEdit } = useAdminEditHymn();

  // edge-to-edge:唔加 top inset 個大字標題會同狀態列時間疊埋(見 useInsets.js)
  const insets = useInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* PHONE-PASSWORD-AUTH-PLAN §5.4:右上角加會員掣,同首頁/我的頁一致;
          搜尋欄/chips 佈局唔郁,淨係標題呢行變成 row。 */}
      <View style={styles.headerRow}>
        <Text style={styles.header}>詩歌庫</Text>
        <AvatarButton onPress={onOpenAuth} />
      </View>
      <Text style={styles.count}>{shown.length} 首</Text>

      {/* 搜尋欄(SEARCH-MERGE-PLAN §3)— 喺固定 header 區內,自動 pinned 唔跟 scroll */}
      <View style={[styles.searchWrap, focused && styles.searchWrapFocused]}>
        <OdeIcon name="search" size={20} color={COLORS.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜尋歌名、歌手、歌詞、專輯"
          placeholderTextColor={COLORS.textDim}
          value={queryInput}
          onChangeText={setQueryInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={() => Keyboard.dismiss()}
          returnKeyType="search"
        />
        {hasQuery && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => { setQueryInput(''); setQuery(''); }}>
            <OdeIcon name="close" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* 語言篩選 */}
      <View style={styles.chipRow}>
        {LANGS.map((l) => (
          <TouchableOpacity
            key={l}
            style={[styles.chip, lang === l && styles.chipActive]}
            onPress={() => { setLang(l); setOrg(null); setKidsSubLang('全部'); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, lang === l && styles.chipTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 兒童 tab 內語言 sub-chips(§4.2,Eric 補充拍板)—— 按實際數據動態生成,
          C4 換血前 real_lang 全部係「兒童」,呢排一粒都唔會出(預期行為)。 */}
      {lang === '兒童' && kidsSubLangs.length > 0 && (
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, kidsSubLang === '全部' && styles.chipActive]}
            onPress={() => setKidsSubLang('全部')}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, kidsSubLang === '全部' && styles.chipTextActive]}>全部</Text>
          </TouchableOpacity>
          {kidsSubLangs.map(([l, n]) => (
            <TouchableOpacity
              key={l}
              style={[styles.chip, kidsSubLang === l && styles.chipActive]}
              onPress={() => setKidsSubLang(l)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, kidsSubLang === l && styles.chipTextActive]}>{l} {n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 團體篩選(橫向,拍板 ✓ 由「歌手」改做「團體」)*/}
      <View style={styles.artistWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[['全部團體', shown.length], ...orgs]}
          keyExtractor={(item) => String(item[0])}
          renderItem={({ item }) => {
            const [name, n] = item;
            const isAll = name === '全部團體';
            const active = isAll ? !org : org === name;
            return (
              <TouchableOpacity
                style={[styles.artistChip, active && styles.artistChipActive]}
                onPress={() => setOrg(isAll ? null : name)}
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
              {/* §4.2:有 performer 就顯示「歌手 · 團體」,冇就「團體 · 真語言」
                  (org/real_lang 離線舊 cache 未必有,逐個兜底)。 */}
              <Text style={styles.rowArtist} numberOfLines={1}>
                {item.performer
                  ? `${item.performer} · ${item.org || item.artist || '未知'}`
                  : `${item.org || item.artist || '未知'} · ${item.real_lang ?? item.lang ?? ''}`}
              </Text>
            </View>
            {/* ≡♪ 加入到清單 + 心心 —— 同 HymnListScreen / 播放清單 sheet 行尾一致;
                成行撳落去照舊播歌,所以唔再需要裝飾性 play-arrow */}
            <TouchableOpacity
              onPress={(e) => { e?.stopPropagation?.(); openAddToPlaylist(item); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.rowAction}
              activeOpacity={0.6}
            >
              <OdeIcon name="addToList" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <Heart hymn={item} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <OdeIcon name={hasQuery ? 'search' : 'library'} size={40} color={COLORS.textSecondary} />
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
              <TouchableOpacity
                style={styles.clearFilterBtn}
                onPress={() => { setLang('全部'); setOrg(null); setKidsSubLang('全部'); }}
                activeOpacity={0.7}
              >
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  header: { ...TYPOGRAPHY.title },
  count: { ...TYPOGRAPHY.artist, paddingHorizontal: 16, marginTop: 2, marginBottom: 10 },
  // 搜尋欄(ODE-HANDOFF §4 5a:16 圓角,深色底,唔再係舊嘅白底藥丸)
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 16,
    marginHorizontal: 16, paddingHorizontal: 16,
    height: 48, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.chipBorder,
  },
  searchWrapFocused: { borderWidth: 2, borderColor: COLORS.primary },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.textPrimary, height: 48 },
  clearBtn: { padding: 4 },
  chipRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 16,
    backgroundColor: COLORS.card, marginRight: 8,
  },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },
  chipTextActive: { color: COLORS.textOnGlow },
  artistWrap: { paddingLeft: 16, marginBottom: 10 },
  artistChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, marginRight: 8, maxWidth: 150,
  },
  artistChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.card },
  artistChipText: { fontSize: 12, color: COLORS.textSecondary },
  artistChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight, ...effects.coverInset },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },   // §5.3 列表 18pt
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  rowAction: { paddingLeft: 14 },
  heart: { paddingLeft: 14 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.artist, marginTop: 8 },
  emptyHint: { fontSize: 13, color: COLORS.textDim, marginTop: 6 },
  clearFilterBtn: {
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 18, borderWidth: 1, borderColor: COLORS.primary,
  },
  clearFilterText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
});
