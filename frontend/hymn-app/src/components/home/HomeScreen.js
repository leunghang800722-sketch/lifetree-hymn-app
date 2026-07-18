// 首頁 —— REDESIGN-PLAN §2.3 十區塊減到四區塊。
//
// 舊版有十個區塊(每日精選/金句/作者推薦/新作品/種類推薦/喜好推薦/共鳴詩/詩句榜/
// 民謠分享/綜合榜),大部分背後冇真數據支撐,得個殼。§2.3 誠實版試版首頁得四個,
// 每個都真係有嘢、撳落去都真係得:
//   1. 每日金句(大卡,經文+出處)
//   2. 繼續收聽(上次聽緊嗰首,一撳即續)
//   3. 精選清單(人手編 4-6 個)
//   4. 最近加入(新歌橫列)
//
// 「精選清單」冇 DB 定義(playlist 表係空),所以喺現有 150 首試版庫度用簡單規則
// 即場砌 —— 語言 + 關鍵字。呢個係現有數據下最誠實嘅做法,有真歌、撳到、播到。

import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../../theme/designSystem';
import DailyVerseCard from './DailyVerseCard';
import { getLastPlayed } from '../../lastPlayed';

function Thumb({ youtubeId, size, radius = 8, icon = 'music-note' }) {
  const [failed, setFailed] = React.useState(false);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: COLORS.cardLight, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcons name={icon} size={size * 0.4} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} onError={() => setFailed(true)} />;
}

// 人手編嘅精選清單規則(語言 + 關鍵字)。§2.3 舉例:安靜靈修 / 粵語敬拜 / 經典聖詩 / 純音樂。
const FEATURED = [
  { id: 'cantonese', title: '粵語敬拜', icon: 'favorite', match: (h) => h.lang === '粵語' },
  { id: 'mandarin',  title: '國語敬拜', icon: 'music-note', match: (h) => h.lang === '國語' },
  { id: 'english',   title: 'English Worship', icon: 'language', match: (h) => h.lang === '英文' },
  { id: 'quiet',     title: '安靜靈修', icon: 'self-improvement',
    match: (h) => /(安靜|靈修|禱告|恩典|同在|安息|寧靜|Still|Peace|Quiet|Rest)/i.test(h.title || '') },
];

export default function HomeScreen({ hymns = [], onPlayHymn }) {
  const last = getLastPlayed();

  const featured = useMemo(() => {
    return FEATURED
      .map((f) => ({ ...f, songs: hymns.filter(f.match) }))
      .filter((f) => f.songs.length >= 3); // 唔夠歌就唔顯示,唔好俾個空清單呃人
  }, [hymns]);

  // 「最近加入」—— 冇 created_at 排序資料,用 id 由大到細近似(id 大 = 遲加入)
  const recent = useMemo(
    () => [...hymns].sort((a, b) => b.id - a.id).slice(0, 12),
    [hymns]
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* 1. 每日金句 —— 呢個係屬靈重點,DailyVerseCard 用緊金色邊 */}
      <DailyVerseCard verse={last ? null : null /* DailyVerseCard 自己 fetch;呢度只保留位置 */} />
      <DailyVerseFetcher />

      {/* 2. 繼續收聽 */}
      {last?.id && (
        <View style={styles.section}>
          <Text style={styles.h2}>繼續收聽</Text>
          <TouchableOpacity style={styles.continueCard} activeOpacity={0.8} onPress={() => onPlayHymn && onPlayHymn(last)}>
            <Thumb youtubeId={last.youtube_id} size={56} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.continueTitle} numberOfLines={1}>{last.title}</Text>
              <Text style={styles.continueArtist} numberOfLines={1}>{last.artist || '未知'}</Text>
            </View>
            <View style={styles.playCircle}>
              <MaterialIcons name="play-arrow" size={26} color={COLORS.background} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* 3. 精選清單 */}
      {featured.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.h2}>精選清單</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            {featured.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={styles.plCard}
                activeOpacity={0.8}
                onPress={() => onPlayHymn && onPlayHymn(f.songs[0], { playlist: f.songs })}
              >
                <Thumb youtubeId={f.songs[0]?.youtube_id} size={150} radius={12} icon={f.icon} />
                <Text style={styles.plTitle} numberOfLines={1}>{f.title}</Text>
                <Text style={styles.plCount}>{f.songs.length} 首</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 4. 最近加入 */}
      {recent.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.h2}>最近加入</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            {recent.map((h) => (
              <TouchableOpacity key={h.id} style={styles.recentCard} activeOpacity={0.8}
                onPress={() => onPlayHymn && onPlayHymn(h)}>
                <Thumb youtubeId={h.youtube_id} size={120} radius={10} />
                <Text style={styles.recentTitle} numberOfLines={2}>{h.title}</Text>
                <Text style={styles.recentArtist} numberOfLines={1}>{h.artist || '未知'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// 每日金句:自己 fetch,keep DailyVerseCard 純顯示。
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
  continueCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, padding: 10, borderRadius: 12, backgroundColor: COLORS.card,
  },
  continueTitle: { ...TYPOGRAPHY.songTitle },
  continueArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  playCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  plCard: { width: 150, marginLeft: 16 },
  plTitle: { ...TYPOGRAPHY.songTitle, marginTop: 8 },
  plCount: { ...TYPOGRAPHY.artist, marginTop: 2 },
  recentCard: { width: 120, marginLeft: 16 },
  recentTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary, marginTop: 8, lineHeight: 18 },
  recentArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
});
