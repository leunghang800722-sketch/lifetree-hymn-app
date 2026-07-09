// src/components/home/HomeScreen.js
// 主頁畫面 — 整合 10 個區塊
import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import DailyQuoteCard from './DailyQuoteCard';
import SectionRow from './SectionRow';
import { homeApi } from '../../services/homeApi';

export default function HomeScreen({ navigation, onPlayHymn }) {
  const [dailyQuote, setDailyQuote] = useState(null);
  const [dailyVerse, setDailyVerse] = useState(null);
  const [featuredArtist, setFeaturedArtist] = useState(null);
  const [newReleases, setNewReleases] = useState([]);
  const [genreRec, setGenreRec] = useState([]);
  const [basedOnTaste, setBasedOnTaste] = useState([]);
  const [resonating, setResonating] = useState([]);
  const [topVerses, setTopVerses] = useState([]);
  const [folkSharing, setFolkSharing] = useState([]);
  const [combinedCharts, setCombinedCharts] = useState([]);

  useEffect(() => {
    loadHomeData();
  }, []);

  const loadHomeData = async () => {
    try {
      const [
        quoteRes,
        verseRes,
        artistRes,
        releasesRes,
        genreRes,
        tasteRes,
        resonRes,
        versesRes,
        folkRes,
        chartsRes,
      ] = await Promise.all([
        homeApi.getDailyQuote(),
        homeApi.getDailyVerse(),
        homeApi.getFeaturedArtist(),
        homeApi.getNewReleases(),
        homeApi.getGenreRecommendation(),
        homeApi.getBasedOnTaste(),
        homeApi.getResonating(),
        homeApi.getTopVerses(),
        homeApi.getFolkSharing(),
        homeApi.getCombinedCharts(),
      ]);

      setDailyQuote(quoteRes);
      setDailyVerse(verseRes);
      setFeaturedArtist(artistRes);
      setNewReleases(releasesRes);
      setGenreRec(genreRes);
      setBasedOnTaste(tasteRes);
      setResonating(resonRes);
      setTopVerses(versesRes);
      setFolkSharing(folkRes);
      setCombinedCharts(chartsRes);
    } catch (error) {
      console.error('Load home data failed:', error);
    }
  };

  const onRefresh = async () => {
    await loadHomeData();
  };

  const playSong = (hymn) => {
    if (onPlayHymn) {
      onPlayHymn(hymn);
    } else if (navigation) {
      navigation.navigate('Player', { hymn });
    }
  };

  return (
    <View>
      <DailyQuoteCard data={dailyQuote} onPress={playSong} />

      <SectionRow
        title="每日金句"
        data={dailyVerse ? [dailyVerse] : []}
        onPress={playSong}
      />

      {featuredArtist && (
        <SectionRow
          title={`${featuredArtist.artist} 作品推薦`}
          data={featuredArtist.hymns || []}
          onPress={playSong}
        />
      )}

      <SectionRow title="新作品" data={newReleases} onPress={playSong} />
      <SectionRow title="種類推薦" data={genreRec} onPress={playSong} />
      <SectionRow title="根據喜好" data={basedOnTaste} onPress={playSong} />
      <SectionRow title="共鳴詩" data={resonating} onPress={playSong} />
      <SectionRow title="詩句榜" data={topVerses} onPress={playSong} />
      <SectionRow title="民謠分享" data={folkSharing} onPress={playSong} />
      <SectionRow title="結合榜" data={combinedCharts} onPress={playSong} />

      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  spacer: {
    height: 80,
  },
});
