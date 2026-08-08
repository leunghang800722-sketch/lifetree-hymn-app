// 清單詳情 —— 「我的」頁撳一個清單入嚟(§MYPAGE-PLAYLIST-MANAGE-PLAN §4)。
//
// full-screen native Modal,由 MineScreen 控制。傳 playlistId **唔係成個 object**:
// 喺呢頁移除歌/改名之後要即時反映,所以每次 render 都由 usePlaylists() 按 id
// 攞最新版;清單唔見咗(被刪)就自動閂。
//
// 播放語義(v231,見 App.js handlePlayHymn 註解):呢頁所有播放都係
// explicit: true —— 用戶明知自己揀緊一個清單,照清單次序播,唔好隨機接續。
//
// 移除單曲**唔使二次確認**(re-add 好易,Spotify 同款);刪成個清單先要確認。

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert, Share } from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import { COLORS, TYPOGRAPHY, effects } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { usePlaylists, MAX_PLAYLIST_SONGS } from '../context/PlaylistsContext';
import { useAddToPlaylist } from '../components/AddToPlaylistSheet';
import { useAuth } from '../context/AuthContext';
import { flush, getOutboxLength } from '../sync/userSync';
import { API_BASE } from '../config';
import { getDisplayTitle } from '../utils/displayTitle';

// mqdefault = 真 16:9 冇黑邊(同 MineScreen / HymnListScreen 一致)
function Cover({ youtubeId, size = 52 }) {
  const [failed, setFailed] = useState(false);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={[styles.cover, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }]}>
        <OdeIcon name="musicNote" size={size * 0.5} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.cover, { width: size, height: size }]} onError={() => setFailed(true)} />;
}

// B9 — 呢個 Modal 冇 TabBar 陪住,mini player 由 App.js 傳落嚟企喺底(見
// App.js/MineScreen.js 嘅註解)。約數高度,留返空間唔好俾佢遮咗尾幾行歌。
const MINI_PLAYER_H = 64;

export default function PlaylistDetailSheet({ playlistId, onClose, onPlayHymn, onOpenAuth, miniPlayer, hasMiniPlayer = false }) {
  const { playlists = [], removeFromPlaylist, deletePlaylist } = usePlaylists() || {};
  const { openRename } = useAddToPlaylist();
  const { user, getToken } = useAuth() || {};
  const insets = useInsets();
  const [sharing, setSharing] = useState(false);

  const visible = !!playlistId;
  const pl = playlists.find((p) => p.id === playlistId);

  // 清單被刪(喺呢頁 ⋯ 刪、或第度刪咗)就冇嘢好顯示,自動閂返出去
  useEffect(() => {
    if (visible && !pl) onClose && onClose();
  }, [visible, pl, onClose]);

  if (!visible || !pl) return null;
  const songs = pl.songs || [];

  // 分享流程(MEMBERSHIP-PHASE3-SHARE-PLAN §2.2)——
  // 未登入 → 引導登入;空清單 → 擋;flush() 確保 server 係最新版先生成 token。
  //
  // Opus 5 驗收揪出:flush() 撞正 App.js onActive 個背景 sync 都喺行緊(userSync
  // 嘅 `_flushing` gate)會直接 return false,呢個唔代表冇網,淨係代表「有人
  // 早咗一步喺推緊」。所以唔可以見到 flush()===false 就即刻彈「冇網」——要睇
  // getOutboxLength() 分流:outbox 空 = 冇嘢等緊推,照出 share;outbox 有嘢就
  // 等 ~800ms(俾嗰個進行緊嘅 flush 有時間做完)再試多一次,仲係推唔晒先至
  // 真係當冇網。flush() 本身嘅語義唔可以郁——App.js onActive 靠佢個 return
  // 決定 pull 覆蓋本地安唔安全。
  const handleShare = async () => {
    if (sharing) return;
    if (!user) {
      Alert.alert('登入先可以分享清單', null, [
        { text: '取消', style: 'cancel' },
        { text: '去登入', onPress: () => onOpenAuth && onOpenAuth() },
      ]);
      return;
    }
    if (!songs.length) {
      Alert.alert('加咗歌先分享啦');
      return;
    }
    setSharing(true);
    try {
      let drained = await flush();
      if (!drained && getOutboxLength() > 0) {
        await new Promise((r) => setTimeout(r, 800));
        drained = await flush();
        if (!drained && getOutboxLength() > 0) {
          Alert.alert('而家冇網,遲啲再試');
          return;
        }
      }
      const token = getToken ? getToken() : null;
      const resp = await fetch(`${API_BASE}/api/me/playlists/${pl.id}/share`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.status === 429) {
        Alert.alert('操作太密,唞一唞再試');
        return;
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.url) {
        Alert.alert('分享失敗,遲啲再試');
        return;
      }
      // URL 直接擺入 message 度——RN Share.share 嘅 url field 係 iOS-only。
      Share.share({ message: `【${pl.name}】詩歌清單(${songs.length} 首)\n${data.url}` }).catch(() => {});
    } catch (_) {
      Alert.alert('分享失敗,遲啲再試');
    } finally {
      setSharing(false);
    }
  };

  // Opus 5 驗收揪出:Android `Alert.alert` 最多得三粒掣(第四粒會冇顯示/迫走
  // 「取消」),之前加咗「分享清單」變四粒就炒咗車。分享已經有 header 隔籬個
  // 圓掣做主入口(足夠當眼,§2.1),呢度冚返三粒(改名/刪除/取消),唔好
  // 再加第四粒落呢個 Alert——如果第日想加多個選項,要諗過用自訂 action sheet
  // 代替原生 Alert,唔可以直接塞落嚟。
  const showMenu = () => {
    Alert.alert(pl.name, null, [
      { text: '改名', onPress: () => openRename && openRename(pl) },
      {
        text: '刪除清單', style: 'destructive',
        onPress: () => Alert.alert('刪除清單', `「${pl.name}」同入面 ${songs.length} 首歌都會刪走。`, [
          { text: '取消', style: 'cancel' },
          // 刪完 pl 變 undefined,上面個 effect 會自動閂 Modal
          { text: '刪除', style: 'destructive', onPress: () => deletePlaylist && deletePlaylist(pl.id) },
        ]),
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  // 播歌後要閂埋自己:播放器 overlay 係主 view hierarchy 嘅嘢(zIndex 999),
  // 畫喺 native Modal **後面**—— Modal 唔閂,用戶會以為撳咗冇反應(emulator 實測)。
  // BUG3(b) P0(Eric 實測,已於 2026-07-29 推翻)——之前呢度加咗
  // `appendAutoplayTail: true`,令 explicit 隊列播晒之後自動播放開住會接一條
  // 隨機尾巴。2026-07-29 Eric 明確要求推翻:「如果我按清單就唔好加其他野」——
  // 自訂清單播晒就停,最尾一首 ⏭ 冇反應係預期行為(QUEUE-UX-4FIXES-PLAN §1/§7-1),
  // 唔算 regression,唔好又加返呢個 flag。
  const play = (hymn) => {
    onPlayHymn && onPlayHymn(hymn, { explicit: true, playlist: songs });
    onClose && onClose();
  };

  const playAll = () => {
    if (!songs.length) return;
    play(songs[0]);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        {/* Header:返回 │ 清單名 + N / 30 首 │ ⋯ */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.headerBtn}>
            <OdeIcon name="back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle} numberOfLines={1}>{pl.name}</Text>
            <Text style={styles.headerSub}>{songs.length} / {MAX_PLAYLIST_SONGS} 首</Text>
          </View>
          <TouchableOpacity onPress={showMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.headerBtn}>
            <OdeIcon name="more" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={songs}
          keyExtractor={(item) => String(item.id)}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom + (hasMiniPlayer ? MINI_PLAYER_H : 0) }}
          ListHeaderComponent={
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.playAll, { opacity: songs.length ? 1 : 0.45 }]}
                onPress={playAll} activeOpacity={0.8} disabled={!songs.length}>
                <OdeIcon name="play" size={22} color={COLORS.textOnGlow} />
                <Text style={styles.playAllText}>播全部</Text>
              </TouchableOpacity>
              {/* 分享係 Phase 3 嘅主打動作,搬 Spotify 同款喺「播全部」隔籬加個
                  獨立圓掣(§2.1)——收埋喺 ⋯ menu 入面唔夠當眼。 */}
              <TouchableOpacity
                style={[styles.shareBtn, { opacity: sharing ? 0.5 : 1 }]}
                onPress={handleShare} activeOpacity={0.8} disabled={sharing}>
                <OdeIcon name="share" size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} activeOpacity={0.7}
              onPress={() => play(item)}>
              <Cover youtubeId={item.youtube_id} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={2}>{getDisplayTitle(item)}</Text>
                <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
              </View>
              <TouchableOpacity onPress={() => removeFromPlaylist && removeFromPlaylist(pl.id, item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.rowAction}>
                <OdeIcon name="trash" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <OdeIcon name="queue" size={40} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>呢個清單仲未有歌</Text>
              <Text style={styles.emptyHint}>喺播放頁或者最愛度撳 ≡♪ 加歌入嚟</Text>
            </View>
          }
        />
        {/* B9 — 呢個 Modal 冇 TabBar 陪住,音樂播緊要有得控制/跳返播放頁 */}
        {miniPlayer}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  headerBtn: { padding: 4 },
  headerText: { flex: 1, marginHorizontal: 12 },
  headerTitle: { ...TYPOGRAPHY.body, fontSize: 18, fontWeight: '700' },
  headerSub: { ...TYPOGRAPHY.artist, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12 },
  playAll: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 18, paddingVertical: 9,
    backgroundColor: COLORS.glow, borderRadius: 20,
    ...effects.ctaGlow, // F3(b):主 CTA 暖光外發光(ODE-HANDOFF §3)
  },
  playAllText: { color: COLORS.textOnGlow, fontWeight: '700', fontSize: 15, marginLeft: 4 },
  shareBtn: {
    width: 38, height: 38, borderRadius: 19, marginLeft: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.cardLight,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  rowAction: { paddingLeft: 14 },
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight, ...effects.coverInset },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginTop: 8 },
  emptyHint: { ...TYPOGRAPHY.artist, marginTop: 4 },
});
