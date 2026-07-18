// 首頁 —— HOME-DISCOVERY-REDESIGN.md(Fable 5 構思)實作版,五個區塊。
//
// 背景:Phase 3 十區塊減到四區塊之後,Eric 試機話「首頁太簡化,根本無歌曲能選」。
// 病根唔係「區塊多定少」,係我哋將歌全部收埋咗入卡入面 —— 首屏得 2-3 首見到歌名。
// 呢版嘅原則:**簡潔 = 區塊種類少 + 層級淺 + 樣式統一;簡潔 ≠ 歌少**。
//
//   1. 每日金句      —— 照舊
//   2. 快速開播列    —— 繼續收聽 + 隨心聽(shuffle 全庫),永遠喺度
//   3. 即刻揀歌      —— chips 切清單,即場列 6 首歌名,撳一下即出聲
//   4. 今日為你預備  —— 日更 6 首(日期種子),三語言各至少一首
//   5. 最近加入      —— 照舊,卡加 play 角標
//
// 全首頁統一語義(§2.6):**撳歌 = 出聲,冇中間頁**。唯一例外係「睇晒 ›」,
// 佢個名已經講明自己係去睇嘢。撳一行歌 = 播嗰首 + 成個清單入隊(唔係得嗰 6 首),
// 播完自動接落去 —— 隊列一次過交俾播放器(Phase 1 機制),唔自己另計 next。
//
// 全部喺 client 用現有 /hymns 全量列表計,冇新 backend API(§6)。

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../../theme/designSystem';
import DailyVerseCard from './DailyVerseCard';
import { getLastPlayed } from '../../lastPlayed';
import { getHomeChip, saveHomeChip } from '../../homePrefs';
import { dailyPick, dailyPickBalanced, randomShuffle } from '../../utils/dailyShuffle';

const LANGS = ['粵語', '國語', '英文'];

// 「即刻揀歌」嘅 chips。DB 冇 playlist 表,所以喺 150 首試版庫用語言 + 關鍵字即場砌 ——
// 現有數據下最誠實嘅做法:有真歌、撳到、播到。將來加清單淨係加一項,唔使改版面。
const CHIP_DEFS = [
  { id: 'cantonese', title: '粵語敬拜', match: (h) => h.lang === '粵語' },
  { id: 'mandarin',  title: '國語敬拜', match: (h) => h.lang === '國語' },
  { id: 'english',   title: 'English',  match: (h) => h.lang === '英文' },
  { id: 'quiet',     title: '安靜靈修',
    match: (h) => /(安靜|靈修|禱告|恩典|同在|安息|寧靜|Still|Peace|Quiet|Rest)/i.test(h.title || '') },
];

function Thumb({ youtubeId, size, radius = 8, icon = 'music-note' }) {
  const [failed, setFailed] = React.useState(false);
  // mqdefault = 真 16:9 冇黑邊(hqdefault 係 4:3,黑邊 baked 咗入張圖)
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: COLORS.cardLight, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcons name={icon} size={size * 0.4} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} onError={() => setFailed(true)} />;
}

// 卡片右下角嘅 play 角標 —— 話俾用戶知「撳我即播」,唔係「撳我入去睇」(§2.4)
function PlayBadge() {
  return (
    <View style={styles.playBadge}>
      <MaterialIcons name="play-arrow" size={18} color={COLORS.accent} />
    </View>
  );
}

// 「今日為你預備」/「最近加入」共用嘅歌卡(樣式統一)
function SongCard({ hymn, onPress }) {
  return (
    <TouchableOpacity style={styles.songCard} activeOpacity={0.8} onPress={onPress}>
      <View>
        <Thumb youtubeId={hymn.youtube_id} size={120} radius={10} />
        <PlayBadge />
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{hymn.title}</Text>
      <Text style={styles.cardArtist} numberOfLines={1}>{hymn.artist || '未知'}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ hymns = [], onPlayHymn, onOpenList }) {
  const last = getLastPlayed();

  // 有歌先計嘢。冇歌(未 load / 冇網)整頁一個狀態,唔好五個區塊各自閃 loading(§2.7)
  const hasData = Array.isArray(hymns) && hymns.length > 0;

  const chips = useMemo(
    () => CHIP_DEFS
      .map((c) => ({ ...c, songs: hymns.filter(c.match) }))
      .filter((c) => c.songs.length >= 3), // 唔夠 3 首就成個 chip 唔出,唔好俾空清單呃人
    [hymns]
  );

  const [chipId, setChipId] = useState(() => getHomeChip());
  // 記低嗰個 chip 可能已經冇咗(改咗規則 / 冇歌),fallback 返第一個
  const activeChip = chips.find((c) => c.id === chipId) || chips[0] || null;

  const pickChip = useCallback((id) => { setChipId(id); saveHomeChip(id); }, []);

  // 每個 chip 嘅 6 首每日輪換(日期種子,當日內唔變)。salt 用 chip id,
  // 唔同 chip 唔會抽埋同一批。
  const chipRows = useMemo(
    () => (activeChip ? dailyPick(activeChip.songs, activeChip.id, 6) : []),
    [activeChip]
  );

  // 「今日為你預備」:有人手精選(featured=1)就由精選池抽,冇就由全庫抽 —— 兩級 fallback。
  // 明買明賣係日更抽選,唔冒充個性化推薦(§2.4)。
  const todayPicks = useMemo(() => {
    const featuredPool = hymns.filter((h) => h.featured === 1);
    const pool = featuredPool.length >= 6 ? featuredPool : hymns;
    return dailyPickBalanced(pool, 'today', 6, LANGS);
  }, [hymns]);

  // 「最近加入」—— 冇 created_at,用 id 由大到細近似(id 大 = 遲加入)
  const recent = useMemo(() => [...hymns].sort((a, b) => b.id - a.id).slice(0, 12), [hymns]);

  const play = useCallback((hymn, list) => {
    if (onPlayHymn && hymn) onPlayHymn(hymn, list ? { playlist: list } : undefined);
  }, [onPlayHymn]);

  // 隨心聽:每次撳都要唔同,所以用真隨機(唔落日期種子)。
  // 洗好副牌先交俾播放器,播放器照住個 queue 行就得。
  const playShuffleAll = useCallback(() => {
    if (!hasData) return;
    const shuffled = randomShuffle(hymns);
    play(shuffled[0], shuffled);
  }, [hymns, hasData, play]);

  if (!hasData) {
    return (
      <View style={styles.emptyRoot}>
        <MaterialIcons name="cloud-off" size={40} color={COLORS.textSecondary} />
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
          服務「我唔想揀,求其播啲好嘢」呢個最大宗嘅心情。兩個掣任何情況都喺度;
          新用戶冇播放紀錄時「隨心聽」自己撐晒成行 —— 由開 App 到出聲一下手指。 */}
      <View style={styles.quickRow}>
        {last?.id && (
          <TouchableOpacity style={[styles.quickBtn, styles.quickBtnHalf]} activeOpacity={0.85}
            onPress={() => play(last)}>
            <MaterialIcons name="play-circle-filled" size={26} color={COLORS.accent} />
            <View style={styles.quickTextWrap}>
              <Text style={styles.quickTitle} numberOfLines={1}>繼續收聽</Text>
              <Text style={styles.quickSub} numberOfLines={1}>{last.title}</Text>
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.quickBtn, last?.id ? styles.quickBtnHalf : styles.quickBtnFull]}
          activeOpacity={0.85}
          onPress={playShuffleAll}
        >
          <MaterialIcons name="shuffle" size={26} color={COLORS.accent} />
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

          <View style={styles.rowsWrap}>
            {chipRows.map((h) => (
              <TouchableOpacity key={h.id} style={styles.songRow} activeOpacity={0.7}
                onPress={() => play(h, activeChip.songs)}>
                <Thumb youtubeId={h.youtube_id} size={40} />
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{h.title}</Text>
                  <Text style={styles.rowArtist} numberOfLines={1}>{h.artist || '未知'}</Text>
                </View>
                <MaterialIcons name="play-arrow" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            ))}

            {/* 尾部兩個掣:即刻播全部 / 想慢慢揀就入去睇晒 */}
            <View style={styles.rowFooter}>
              <TouchableOpacity style={styles.footerPlay} activeOpacity={0.85}
                onPress={() => play(activeChip.songs[0], activeChip.songs)}>
                <MaterialIcons name="play-arrow" size={18} color={COLORS.background} />
                <Text style={styles.footerPlayText}>播全部 {activeChip.songs.length} 首</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.footerMore} activeOpacity={0.7}
                onPress={() => onOpenList && onOpenList(activeChip.songs, activeChip.title)}>
                <Text style={styles.footerMoreText}>睇晒 {activeChip.songs.length} 首</Text>
                <MaterialIcons name="chevron-right" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
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
    backgroundColor: COLORS.card, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  quickBtnHalf: { flex: 1, marginHorizontal: 4 },
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
  chipOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  chipTextOn: { color: COLORS.background },
  rowsWrap: { marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 14, overflow: 'hidden' },
  songRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, // 40 縮圖 + 上下 10 = 60 高,過 48 觸控標準
  },
  rowTextWrap: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle }, // §5.3 列表歌名 18pt
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  rowFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  footerPlay: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.accent, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  footerPlayText: { fontSize: 14, fontWeight: '700', color: COLORS.background, marginLeft: 4 },
  footerMore: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 9 },
  footerMoreText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },

  // 4 + 5 共用歌卡
  songCard: { width: 120, marginLeft: 16 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginTop: 8, lineHeight: 18 },
  cardArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  playBadge: {
    position: 'absolute', right: 6, bottom: 6,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(11,15,14,0.72)',
    alignItems: 'center', justifyContent: 'center',
  },
});
