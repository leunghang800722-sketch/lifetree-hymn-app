// 收到嘅分享清單詳情頁(MEMBERSHIP-PHASE3-SHARE-PLAN §2.3)。
//
// 抄 PlaylistDetailSheet.js 個殼(同款 full-screen native Modal + mini player
// 傳法),但呢頁資料嚟自 GET /api/p/<token>(公開,唔使登入),冇移除單曲
// 掣,主 CTA 換成「儲存做我嘅清單」。
//
// 三態:loading / 410(清單已經唔存在)/ 網絡錯——同一個 fetch 一次過分清楚,
// 唔使額外 retry 邏輯(用戶自己閂咗再撳 link 一次就係 retry)。

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { usePlaylists } from '../context/PlaylistsContext';
import { API_BASE } from '../config';
import { getDisplayTitle } from '../utils/displayTitle';

// mqdefault = 真 16:9 冇黑邊(同 PlaylistDetailSheet 一致)
function Cover({ youtubeId, size = 52 }) {
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

export default function SharedPlaylistSheet({ token, onClose, onPlayHymn, miniPlayer, hasMiniPlayer = false }) {
  const { importPlaylist } = usePlaylists() || {};
  const insets = useInsets();

  // state: 'loading' | 'ok' | 'gone' | 'error'
  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  const visible = !!token;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setState('loading');
    setData(null);
    fetch(`${API_BASE}/api/p/${token}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 410) { setState('gone'); return; }
        if (!r.ok) { setState('error'); return; }
        const json = await r.json().catch(() => null);
        if (!json) { setState('error'); return; }
        setData(json);
        setState('ok');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [token, visible]);

  if (!visible) return null;

  const songs = data?.songs || [];

  const play = (hymn) => {
    // explicit:true —— 呢個係「揀咗一個清單」,唔係單曲,照清單次序播晒
    // (PlaylistDetailSheet 同一套語義,見 App.js handlePlayHymn 註解)。
    onPlayHymn && onPlayHymn(hymn, { explicit: true, playlist: songs });
    onClose && onClose();
  };

  const playAll = () => {
    if (!songs.length) return;
    play(songs[0]);
  };

  // 儲存做副本(§2.4)——唔使登入,落本地 MMKV(登入用戶自動同步)。副本
  // 從此同原清單無關,對方改名/加減歌都唔會影響呢份 copy。
  const handleSave = () => {
    if (saving || !data) return;
    setSaving(true);
    try {
      importPlaylist && importPlaylist(data.name, songs);
      Alert.alert('已儲存到我的清單');
      onClose && onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.headerBtn}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>{data?.name || '分享嘅清單'}</Text>
            {state === 'ok' && (
              <Text style={styles.headerSub}>
                {data?.owner ? `由 ${data.owner} 分享 · ` : ''}{songs.length} 首
              </Text>
            )}
          </View>
          <View style={styles.headerBtn} />
        </View>

        {state === 'loading' && (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        )}

        {state === 'gone' && (
          <View style={styles.centerState}>
            <MaterialIcons name="link-off" size={40} color={COLORS.textSecondary} />
            <Text style={styles.emptyText}>呢個清單已經唔存在</Text>
          </View>
        )}

        {state === 'error' && (
          <View style={styles.centerState}>
            <MaterialIcons name="wifi-off" size={40} color={COLORS.textSecondary} />
            <Text style={styles.emptyText}>而家冇網,遲啲再試</Text>
          </View>
        )}

        {state === 'ok' && (
          <FlatList
            data={songs}
            keyExtractor={(item) => String(item.id)}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 + insets.bottom + (hasMiniPlayer ? 64 : 0) }}
            ListHeaderComponent={
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={[styles.playAll, { opacity: songs.length ? 1 : 0.45 }]}
                  onPress={playAll} activeOpacity={0.8} disabled={!songs.length}>
                  <MaterialIcons name="play-arrow" size={22} color={COLORS.background} />
                  <Text style={styles.playAllText}>播全部</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { opacity: saving ? 0.5 : 1 }]}
                  onPress={handleSave} activeOpacity={0.8} disabled={saving}>
                  <MaterialIcons name="library-add" size={20} color={COLORS.background} />
                  <Text style={styles.saveBtnText}>儲存做我嘅清單</Text>
                </TouchableOpacity>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => play(item)}>
                <Cover youtubeId={item.youtube_id} />
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{getDisplayTitle(item)}</Text>
                  <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons name="queue-music" size={40} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>呢個清單冇歌</Text>
              </View>
            }
          />
        )}

        {/* B9 — 呢個 Modal 冇 TabBar 陪住,音樂播緊要有得控制/跳返播放頁 */}
        {miniPlayer}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  headerBtn: { padding: 4, width: 32 },
  headerText: { flex: 1, marginHorizontal: 12 },
  headerTitle: { ...TYPOGRAPHY.body, fontSize: 18, fontWeight: '700' },
  headerSub: { ...TYPOGRAPHY.artist, marginTop: 2 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerActions: { marginHorizontal: 16, marginBottom: 12 },
  playAll: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 18, paddingVertical: 9, marginBottom: 10,
    backgroundColor: COLORS.cardLight, borderRadius: 20,
  },
  playAllText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 15, marginLeft: 4 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch',
    paddingHorizontal: 18, paddingVertical: 12,
    backgroundColor: COLORS.accent, borderRadius: 20,
  },
  saveBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 15, marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginTop: 8 },
});
