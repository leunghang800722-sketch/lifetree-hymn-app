// 首頁 —— HOME-DISCOVERY-REDESIGN.md(Fable 5 構思)實作版,五個區塊。
//
// 背景:Phase 3 十區塊減到四區塊之後,Eric 試機話「首頁太簡化,根本無歌曲能選」。
// 病根唔係「區塊多定少」,係我哋將歌全部收埋咗入卡入面 —— 首屏得 2-3 首見到歌名。
// 呢版嘅原則:**簡潔 = 區塊種類少 + 層級淺 + 樣式統一;簡潔 ≠ 歌少**。
//
//   1. 每日金句      —— 照舊
//   2. 快速開播列    —— 繼續收聽 + 隨心聽(shuffle 全庫),永遠喺度
//   3. 即刻揀歌      —— chip 撳一下切分類;揀咗嗰個分類啲歌橫向分頁,每頁 4 首、
//                      最多 5 頁(即係一個分類滑得到 20 首),撳一下即出聲。
//                      滑晒 20 首仲想睇就用底部「睇晒 N 首」入全 list。
//                      (Eric 2026-07 指定,參考 YouTube Music)
//   4. 今日為你預備  —— 日更 6 首(日期種子),三語言各至少一首
//   5. 最近加入      —— 照舊,卡加 play 角標
//
// 全首頁統一語義(§2.6):**撳歌 = 出聲,冇中間頁**。唯一例外係「睇晒 ›」,
// 佢個名已經講明自己係去睇嘢。撳一行歌 = 播嗰首 + 成個清單入隊(唔係得嗰 6 首),
// 播完自動接落去 —— 隊列一次過交俾播放器(Phase 1 機制),唔自己另計 next。
//
// 全部喺 client 用現有 /hymns 全量列表計,冇新 backend API(§6)。

import React, { useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Dimensions, ActivityIndicator } from 'react-native';
import OdeIcon from '../../icons/OdeIcon';
import { COLORS, TYPOGRAPHY, radii, effects } from '../../theme/designSystem';
import DailyVerseCard from './DailyVerseCard';
import { getHomeChip, saveHomeChip } from '../../homePrefs';
import { dailyPick, dailyPickBalanced, randomShuffle } from '../../utils/dailyShuffle';
// PHASE2.5-PRELOAD-PLAN §4 W2 —— chip 定義 + 「現用邊個 chip」嘅 fallback 邏輯而家
// 同 App.js 嘅開機預載器共用一份,唔可以喺呢度另外抄一套(drift 咗預載就會落錯歌)。
import { CHIP_PAGE_SIZE, buildChips, hasAlbum } from '../../utils/homeChips';
import { isTooLongForAutoplay } from '../../utils/autoplay';
// W3 —— 「隨心聽」第一首偏向已經落載咗喺機入面嘅歌(iOS;Android 恆 null 自動 no-op)。
import { getLocalUri } from '../../audioPrefetch';
import { useFavorites } from '../../context/FavoritesContext';
import { getDisplayTitle } from '../../utils/displayTitle';

const LANGS = ['粵語', '國語', '英文'];

// 「即刻揀歌」橫向 pager 幾何(參考 YouTube Music「為你推薦」)。
// PEEK = 右邊露出下一頁嘅少少邊,冇咗佢用戶唔知仲有得滑 —— 呢個係成個設計嘅重點。
// snapToInterval = 頁闊 + 間距,咁樣一滑就啱啱好停喺下一頁開頭。
const SCREEN_W = Dimensions.get('window').width;
const PAGE_H_MARGIN = 16;   // 同其他區塊嘅左右邊距睇齊
const PAGE_PEEK = 28;       // 露出下一頁幾多
const PAGE_GAP = 12;
const PAGE_W = SCREEN_W - PAGE_H_MARGIN * 2 - PAGE_PEEK;
const PAGE_SNAP = PAGE_W + PAGE_GAP;
// 每頁 4 首(唔係 5)—— 5 首嗰陣最尾一首會俾 mini player 擋住,見唔晒。
// 頁數補返上去 5 頁,所以一個分類仍然係滑到 20 首。
// 實數喺 utils/homeChips.js(預載器都要知道「首頁嗰版」係邊幾首)。
const SONGS_PER_PAGE = CHIP_PAGE_SIZE;
const MAX_PAGES = 5;        // 4 × 5 = 一個分類最多滑到 20 首,再多就用「睇晒」
// 🔴 v233:上一版 ROW_H 當咗 60(40 縮圖 + 上下 10 padding),但一行實際高度係由
// **文字**決定,唔係縮圖:歌名 18pt(預設行高 ~24)+ 間距 2 + 歌手 14pt(~19)= ~45,
// 加返上下 padding 20 = **~65px**。4 行真係要 260px,但頁高鎖咗 4×60=240 →
// overflow:hidden 就切咗第 4 首。而且系統字體放大仲會更差。
// 而家改成**寫死每行高度 + 寫死行高**,個數就係實數,唔會再靠估。
const ROW_TITLE_LH = 22;
const ROW_ARTIST_LH = 18;
const ROW_H = 64;           // 22 + 2 + 18 = 42 文字,+ 上下 11 padding = 64

function Thumb({ youtubeId, size, radius = 8, icon = 'musicNote' }) {
  const [failed, setFailed] = React.useState(false);
  // mqdefault = 真 16:9 冇黑邊(hqdefault 係 4:3,黑邊 baked 咗入張圖)
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: COLORS.cardLight, alignItems: 'center', justifyContent: 'center', ...effects.coverInset }}>
        <OdeIcon name={icon} size={size * 0.4} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, ...effects.coverInset }} onError={() => setFailed(true)} />;
}

// 卡片右下角嘅 play 角標 —— 話俾用戶知「撳我即播」,唔係「撳我入去睇」(§2.4)
function PlayBadge() {
  return (
    <View style={styles.playBadge}>
      <OdeIcon name="play" size={18} color={COLORS.glow} />
    </View>
  );
}

// 心心 —— 首頁每首歌都撳得,唔使入播放頁先加到最愛(Eric v233)。
// stopPropagation:唔好連埋外面張卡/嗰行一齊觸發播歌。
// hitSlop:20px 嘅 icon 冇撐大觸控範圍好易撳唔中。
function Heart({ hymn, style }) {
  const { isFavorite, toggleFavorite } = useFavorites() || {};
  if (!hymn?.id || typeof toggleFavorite !== 'function') return null;
  const on = typeof isFavorite === 'function' ? isFavorite(hymn.id) : false;
  return (
    <TouchableOpacity
      onPress={(e) => { e?.stopPropagation?.(); toggleFavorite(hymn); }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.6}
      style={style}
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

// 「今日為你預備」/「最近加入」共用嘅歌卡(樣式統一)
// 心心擺喺封面左上,同右下角個 play 角標分開,唔會撞。
function SongCard({ hymn, onPress }) {
  return (
    <TouchableOpacity style={styles.songCard} activeOpacity={0.8} onPress={onPress}>
      <View>
        <Thumb youtubeId={hymn.youtube_id} size={120} radius={10} />
        <PlayBadge />
        <Heart hymn={hymn} style={styles.cardHeart} />
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{getDisplayTitle(hymn)}</Text>
      <Text style={styles.cardArtist} numberOfLines={1}>{hymn.artist || '未知'}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ hymns = [], loading = false, onPlayHymn, onOpenList }) {
  // 有歌先計嘢。冇歌(未 load / 冇網)整頁一個狀態,唔好五個區塊各自閃 loading(§2.7)
  const hasData = Array.isArray(hymns) && hymns.length > 0;

  // 每一頁 = 一個分類。每頁 5 首每日輪換(日期種子,當日內唔變),salt 用 chip id,
  // 唔同分類唔會抽埋同一批。夠 3 首先開個 chip,唔好俾空清單呃人。
  const chips = useMemo(() => buildChips(hymns), [hymns]);

  // chip = 撳一下切分類(照舊)。記低嗰個可能已經冇咗,fallback 返第一個。
  const [chipId, setChipId] = useState(() => getHomeChip());
  const activeChip = chips.find((c) => c.id === chipId) || chips[0] || null;

  // 揀咗嘅分類入面抽最多 20 首(4 頁 × 每頁 5 首),再切成一頁頁。
  // 唔夠 20 首就少啲頁(例如靈修 14 首 = 3 頁),最尾一頁唔滿都照出,
  // 但每頁高度鎖死 5 行,唔會因為尾頁少歌而彈高彈低。
  const pages = useMemo(() => {
    if (!activeChip) return [];
    const picked = dailyPick(activeChip.songs, activeChip.id, SONGS_PER_PAGE * MAX_PAGES);
    const out = [];
    for (let i = 0; i < picked.length; i += SONGS_PER_PAGE) {
      out.push(picked.slice(i, i + SONGS_PER_PAGE));
    }
    return out;
  }, [activeChip]);

  const pagerRef = useRef(null);
  const [page, setPage] = useState(0);

  // 切分類 = 歌曲區域返返第一頁(唔好停喺上一個分類嘅第 3 頁)
  const pickChip = useCallback((id) => {
    setChipId(id);
    saveHomeChip(id);
    setPage(0);
    pagerRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, []);

  const onPagerSettle = useCallback((e) => {
    const raw = Math.round(e.nativeEvent.contentOffset.x / PAGE_SNAP);
    setPage(Math.min(Math.max(raw, 0), Math.max(pages.length - 1, 0)));
  }, [pages.length]);

  // 「今日為你預備」:有人手精選(featured=1)就由精選池抽,冇就由全庫抽 —— 兩級 fallback。
  // 明買明賣係日更抽選,唔冒充個性化推薦(§2.4)。
  // HOME-DISCOVERY-QUALITY-FILTER(Eric 2026-09-02 拍板)—— 兩級 pool 都要
  // 先過 hasAlbum() 先揀,唔淨係「即刻揀歌」有呢條規矩(同 homeChips.js
  // 嘅 hasAlbum 共用一份定義,唔好抄第二份)。
  const todayPicks = useMemo(() => {
    const qualityPool = hymns.filter(hasAlbum);
    const featuredPool = qualityPool.filter((h) => h.featured === 1);
    const pool = featuredPool.length >= 6 ? featuredPool : qualityPool;
    return dailyPickBalanced(pool, 'today', 6, LANGS);
  }, [hymns]);

  // 「最近加入」—— 冇 created_at,用 id 由大到細近似(id 大 = 遲加入)
  const recent = useMemo(() => [...hymns].sort((a, b) => b.id - a.id).slice(0, 12), [hymns]);

  // v231 —— 兩種播放語義(Eric 要求,對齊 Spotify/YT Music):
  //   explicit = true  → 用戶揀咗**成個清單**(「播全部」/「隨心聽」),跟清單次序播晒。
  //   explicit = 唔傳  → 用戶淨係撳咗**一首散歌** → 播嗰首 + 自動接一段隨機,
  //                      佇列會出「正在隨機播放：」分隔線。
  // 第三個參數係**明確標記**,唔好用「hymn 係咪 list[0]」嚟猜 —— 撳「今日為你預備」
  // 第一張卡就啱啱好等於 todayPicks[0],咁猜會撞錯。
  //
  // 2026-07-30 Eric 三場景規格(QUEUE-BEHAVIOR-3-SCENARIOS-PLAN)推翻
  // BUG3(a):瀏覽撳歌 = 單曲 + 30 首類似尾巴(playSingle 條路);想聽成個
  // 分類用「播晒 N 首」掣或者「睇晒」頁。播緊清單時撳呢度依然係插播——
  // 由 playSingle 自己嘅插播分支處理,唔再需要 browseTap flag。「今日為你
  // 預備」/「最近加入」嗰兩行卡一直都係單曲 + 隨機接續,冇改過。
  const play = useCallback((hymn, list, explicit, surface) => {
    if (onPlayHymn && hymn) onPlayHymn(hymn, list ? { playlist: list, explicit: !!explicit, surface } : undefined);
  }, [onPlayHymn]);

  // 隨心聽:每次撳都要唔同,所以用真隨機(唔落日期種子)。
  // 洗好副牌先交俾播放器,播放器照住個 queue 行就得。
  //
  // PHASE2.5-PRELOAD-PLAN §4 W3 —— 首屏最當眼嘅「唔想揀」入口:洗完牌之後,
  // 喺副牌入面搵**第一隻**機入面已經有本地檔嘅歌,調上第一位。撳落去就係
  // file://,即撳即出聲(~0.2s),唔使食 AVPlayer 起 asset 嗰 9 秒。
  //   - 語義仍然係隨機:只係喺已經洗好嘅牌入面提前咗一隻「即開」嘅,
  //     第 2 首起完全唔郁。快取有 60 首 LRU(用戶自己聽開嘅 + 每日 picks),
  //     唔會日日都係同一首。
  //   - 零流量成本(唔會為咗呢個去落載任何嘢)。
  //   - findIndex 撞到第一隻就收工,所以最多只會 touch 一個 id,唔會沖走
  //     audioPrefetch 嗰個 12 格 LRU 保護名單(見 audioPrefetch.js touch())。
  //   - Android:getLocalUri() 恆回 null → hit = -1 → 完全冇行為改變。
  const playShuffleAll = useCallback(() => {
    if (!hasData) return;
    // 長檔閘(Eric 2026-08-25 拍板)—— 隨心聽唔抽 >10 分鐘長檔,同自動接續
    // 池同一把尺(utils/autoplay.js isTooLongForAutoplay 註解有成單事故背景)。
    // HOME-DISCOVERY-QUALITY-FILTER(Eric 2026-09-02 拍板)—— 加埋 hasAlbum()
    // 揸走冇正式專輯歸屬嘅歌。防呆分兩層:先試「長檔 + album 都過」,唔夠
    // 就退一步淨過 album 嗰層,全庫都冚唔到先真係唔 filter——個掣唔可以
    // 因為 filter 太嚴變死掣。
    const strictPool = hymns.filter((h) => !isTooLongForAutoplay(h) && hasAlbum(h));
    const albumOnlyPool = hymns.filter(hasAlbum);
    const pool = strictPool.length > 0 ? strictPool : (albumOnlyPool.length > 0 ? albumOnlyPool : hymns);
    const shuffled = randomShuffle(pool);
    const hit = shuffled.findIndex((h) => h?.id != null && getLocalUri(h.id) != null);
    if (hit > 0) {
      const first = shuffled[0];
      shuffled[0] = shuffled[hit];
      shuffled[hit] = first;
    }
    // surface='shuffle' —— W4 量度用(唔靠「首數啱唔啱」去猜入口,見 App.js)。
    play(shuffled[0], shuffled, true, 'shuffle'); // 洗好副牌 = 明確嘅清單,唔好再加隨機尾巴
  }, [hymns, hasData, play]);

  if (!hasData) {
    // 仲喺度攞緊(未 timeout / 未 retry 完)—— 顯示 loading,唔好一冇歌就
    // 話「網絡斷咗」。真正逾時+retry 完都攞唔到先落去底下嗰個錯誤畫面。
    if (loading) {
      return (
        <View style={styles.emptyRoot}>
          <ActivityIndicator size="large" color={COLORS.glow} />
        </View>
      );
    }
    return (
      <View style={styles.emptyRoot}>
        <OdeIcon name="cloudOff" size={40} color={COLORS.textSecondary} />
        <Text style={styles.emptyText}>網絡好似斷咗</Text>
        <Text style={styles.emptyHint}>連得返線會自動載返啲詩歌</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ===== 1. 每日金句 ===== */}
      <DailyVerseFetcher />

      {/* ===== 2. 快速開播列 =====
          服務「我唔想揀,求其播啲好嘢」呢個最大宗嘅心情。
          2026-07-29 QUEUE-UX-4FIXES §4/§7-3:「繼續收聽」卡已剷——Eric 決定
          「關 app 後播放頁的清單重新開始唔會有記憶」,依張卡(靠 lastPlayed.js
          記低最後一首)同呢條新規矩正面衝突,連 lastPlayed.js 呢個 module 都
          一齊刪咗(App.js 亦已移除寫入/預熱呼叫)。而家「隨心聽」自己撐晒成行。 */}
      <View style={styles.quickRow}>
        <TouchableOpacity
          style={[styles.quickBtn, styles.quickBtnFull]}
          activeOpacity={0.85}
          onPress={playShuffleAll}
        >
          <OdeIcon name="shuffle" size={26} color={COLORS.glow} />
          <View style={styles.quickTextWrap}>
            <Text style={styles.quickTitle} numberOfLines={1}>隨心聽</Text>
            <Text style={styles.quickSub} numberOfLines={1}>隨機播放全部詩歌</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ===== 3. 即刻揀歌 =====
          chips 切清單 → 即場列 6 首歌名 → 撳一行即出聲,唔使入任何子頁面。
          三個(將來更多)清單共用同一塊 6 行嘅位,密度同簡潔兩樣都攞到。 */}
      {activeChip && (
        <View style={styles.section}>
          <Text style={styles.h2}>即刻揀歌</Text>

          {/* chips —— 撳一下切分類(照舊) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipBar}>
            {chips.map((c) => {
              const on = c.id === activeChip.id;
              return (
                <TouchableOpacity key={c.id} onPress={() => pickChip(c.id)} activeOpacity={0.8}
                  style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {c.title}（{c.songs.length}）
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 揀咗嘅分類入面,啲歌橫向分頁:每頁 5 首,最多 4 頁 = 一個分類滑得到 20 首。
              右邊 peek 住下一頁話俾你知仲有得滑;snapToInterval 令佢一頁一頁咁停。
              滑晒 20 首仲想睇,就用下面「睇晒 N 首」入全 list。 */}
          <ScrollView
            ref={pagerRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={PAGE_SNAP}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            contentContainerStyle={{ paddingHorizontal: PAGE_H_MARGIN }}
            onMomentumScrollEnd={onPagerSettle}
          >
            {pages.map((rows, i) => (
              <View key={`${activeChip.id}-${i}`} style={styles.page}>
                {rows.map((h) => (
                  <TouchableOpacity key={h.id} style={styles.songRow} activeOpacity={0.7}
                    onPress={() => onPlayHymn && onPlayHymn(h)}>
                    <Thumb youtubeId={h.youtube_id} size={40} />
                    <View style={styles.rowTextWrap}>
                      {/* numberOfLines stays 1 here — ROW_H (64px) is a hand-tuned
                          constant load-bearing for the fixed-height horizontal pager
                          above (page height = SONGS_PER_PAGE × ROW_H); a 2nd text line
                          would overflow/clip it. getDisplayTitle() already shortens
                          the common cases, so this is still a net improvement. */}
                      <Text style={styles.rowTitle} numberOfLines={1}>{getDisplayTitle(h)}</Text>
                      <Text style={styles.rowArtist} numberOfLines={1}>{h.artist || '未知'}</Text>
                    </View>
                    <OdeIcon name="play" size={22} color={COLORS.textSecondary} />
                    <Heart hymn={h} style={styles.rowHeart} />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </ScrollView>

          {/* 第幾頁指示器 —— 呢度啲頁冇名(全部都係同一個分類嘅歌),所以用 dots */}
          {pages.length > 1 && (
            <View style={styles.dots}>
              {pages.map((_, i) => (
                <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
              ))}
            </View>
          )}

          {/* 底部(成個分類共用一組,唔係逐頁重複) */}
          <View style={styles.chipFooter}>
            <TouchableOpacity style={styles.footerPlay} activeOpacity={0.85}
              onPress={() => play(activeChip.songs[0], activeChip.songs, true)}>
              <OdeIcon name="play" size={18} color={COLORS.textOnGlow} />
              <Text style={styles.footerPlayText}>播全部 {activeChip.songs.length} 首</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.footerMore} activeOpacity={0.7}
              onPress={() => onOpenList && onOpenList(activeChip.songs, activeChip.title)}>
              <Text style={styles.footerMoreText}>睇晒 {activeChip.songs.length} 首</Text>
              <OdeIcon name="chevronRight" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ===== 4. 今日為你預備 =====
          同「每日金句」一對,日日開 App 有兩樣「今日限定」。 */}
      {todayPicks.length >= 3 && (
        <View style={styles.section}>
          <Text style={styles.h2}>今日為你預備</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            {todayPicks.map((h) => (
              <SongCard key={h.id} hymn={h} onPress={() => play(h, todayPicks)} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ===== 5. 最近加入 ===== */}
      {recent.length >= 3 && (
        <View style={styles.section}>
          <Text style={styles.h2}>最近加入</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            {recent.map((h) => (
              <SongCard key={h.id} hymn={h} onPress={() => play(h, recent)} />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// 每日金句:自己 fetch,keep DailyVerseCard 純顯示(冇 verse 就自己 return null)。
function DailyVerseFetcher() {
  const [verse, setVerse] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    import('../../services/homeApi').then(({ homeApi }) => {
      homeApi.getDailyVerse().then((v) => { if (alive) setVerse(v); }).catch(() => {});
    });
    return () => { alive = false; };
  }, []);
  return <DailyVerseCard verse={verse} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingTop: 12 },
  section: { marginBottom: 22 },
  h2: { ...TYPOGRAPHY.sectionTitle, paddingHorizontal: 16, marginBottom: 12 },

  // 空狀態 —— 整頁一個,唔好逐個區塊閃(§2.7)
  emptyRoot: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { ...TYPOGRAPHY.body, marginTop: 12, fontWeight: '600' },
  emptyHint: { ...TYPOGRAPHY.artist, marginTop: 6, textAlign: 'center' },

  // 2. 快速開播列 —— 掣高 ≥56,生命綠(金色只留返俾金句)
  quickRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 22 },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', minHeight: 56,
    backgroundColor: COLORS.card, borderRadius: radii.card, // F3(c):14→18(ODE-HANDOFF §3)
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  quickBtnFull: { flex: 1, marginHorizontal: 4 },
  quickTextWrap: { flex: 1, marginLeft: 10 },
  quickTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  quickSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  // 3. 即刻揀歌
  chipBar: { paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: COLORS.card, marginRight: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  chipTextOn: { color: COLORS.textOnGlow },
  // 每一頁固定闊度 + 鎖死高度(5 行)—— pager 靠呢個 + PAGE_SNAP 做 snap。
  // 鎖高係因為最尾一頁可能唔夠 5 首,唔鎖住滑到嗰頁成個區塊會縮,好核突。
  page: {
    width: PAGE_W, height: SONGS_PER_PAGE * ROW_H, marginRight: PAGE_GAP,
    backgroundColor: COLORS.card, borderRadius: radii.card, overflow: 'hidden', // F3(c):14→18
  },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  dot: {
    width: 6, height: 6, borderRadius: 3, marginHorizontal: 3,
    backgroundColor: COLORS.border,
  },
  dotOn: { backgroundColor: COLORS.primary, width: 16 },
  chipFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: PAGE_H_MARGIN, marginTop: 12,
  },
  songRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12,
    height: ROW_H,   // 寫死:頁高 = SONGS_PER_PAGE × ROW_H 先至係實數(見上面註解)
  },
  rowTextWrap: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle, lineHeight: ROW_TITLE_LH }, // §5.3 列表歌名 18pt
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2, lineHeight: ROW_ARTIST_LH },
  footerPlay: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.glow, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 9,
    ...effects.ctaGlow, // F3(b):主 CTA 暖光外發光(ODE-HANDOFF §3)
  },
  footerPlayText: { fontSize: 14, fontWeight: '700', color: COLORS.textOnGlow, marginLeft: 4 },
  footerMore: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 9 },
  footerMoreText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },

  // 4 + 5 共用歌卡
  songCard: { width: 120, marginLeft: 16 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginTop: 8, lineHeight: 18 },
  cardArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  cardHeart: {
    position: 'absolute', left: 6, top: 6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(11,15,14,0.72)',
    alignItems: 'center', justifyContent: 'center',
  },
  rowHeart: { paddingLeft: 12 },
  playBadge: {
    position: 'absolute', right: 6, bottom: 6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(11,15,14,0.72)',
    alignItems: 'center', justifyContent: 'center',
  },
});
