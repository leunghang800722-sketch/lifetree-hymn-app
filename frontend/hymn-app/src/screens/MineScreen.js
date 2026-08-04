// 我的 —— REDESIGN-PLAN §2.2「最愛 + 我嘅清單 + 登入/帳戶 + 設定 全部喺呢度」
//
// 舊版呢啲嘢散喺三個 tab(清單/最愛)加零散入口。合併埋一個 tab,少兩格。
//
// ⚠️ 設定嗰part:§5.3 原本建議嘅「大字模式」2026-07-15 Eric 已確認**唔做**
// (主要用戶唔係長者),所以呢度冇字體大小設定。深淺色模式亦都跟 §5.4「深色為主,
// 日後有餘力先考慮淺色」,所以而家淨係得帳戶相關。

import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Alert, ScrollView, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS, TYPOGRAPHY } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';
import { useFavorites } from '../context/FavoritesContext';
import { usePlaylists } from '../context/PlaylistsContext';
import { useAuth } from '../context/AuthContext';
import { useAddToPlaylist } from '../components/AddToPlaylistSheet';
import AvatarButton from '../components/AvatarButton';
import PlaylistDetailSheet from './PlaylistDetailSheet';
import SharedPlaylistSheet from './SharedPlaylistSheet';
import AddFriendSheet from './AddFriendSheet';
import FriendSharesSheet from './FriendSharesSheet';
import { getDisplayTitle } from '../utils/displayTitle';
import { adminListDelistedHymns, friendsList, friendsAccept, friendsDelete, friendsErrorMessage } from '../api';
import { useCachedHymns } from '../hooks/useCachedHymns';

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

export default function MineScreen({ onPlayHymn, onOpenAuth, onOpenAdminAdd, miniPlayer, hasMiniPlayer }) {
  const { favorites = [], toggleFavorite } = useFavorites() || {};
  const { playlists = [], deletePlaylist } = usePlaylists() || {};
  const { user, isAdmin, getToken } = useAuth() || {};
  const { open: openAddToPlaylist, openCreate, openRename } = useAddToPlaylist();
  const [tab, setTab] = useState('favorites'); // favorites | playlists | delisted
  const [detailId, setDetailId] = useState(null); // 開緊邊個清單嘅詳情頁

  // 已下架 tab(MYPAGE-ADMIN-CHIPS-PLAN §4.3)—— 淨係 admin 先會撳到嗰粒
  // chip,簡單 useState 夠用,唔使成個 context。
  const [delisted, setDelisted] = useState([]);
  const [delistedLoading, setDelistedLoading] = useState(false);
  // ⚠️ Opus 5 驗收揪出:喺已下架 tab relist 完一首歌、close URL加歌 modal,
  // tab 仲係舊資料,要切走再切返先見到。訂閱現有 notifyHymnsChanged() 機制
  // (useCachedHymns.js)——confirm/relist 成功已經會 call 佢,呢度攞返
  // cachedHymns 個 reference 落 dep array,佢一變(代表歌庫改咗)就即刻
  // refetch,唔使開新 context。
  const { hymns: cachedHymns } = useCachedHymns();
  useEffect(() => {
    if (tab !== 'delisted' || !isAdmin) return;
    let cancelled = false;
    setDelistedLoading(true);
    adminListDelistedHymns(getToken ? getToken() : null)
      .then((items) => { if (!cancelled) setDelisted(items || []); })
      .catch(() => { if (!cancelled) setDelisted([]); })
      .finally(() => { if (!cancelled) setDelistedLoading(false); });
    return () => { cancelled = true; };
  }, [tab, isAdmin, getToken, cachedHymns]);

  // ── 好友(MEMBERSHIP-PHASE4-FRIENDS-INVITES-PLAN §3.1/3.2)──────────────
  // incoming>0 要喺 chip 度出紅點,所以登入即刻攞一次(唔淨係入咗 tab 先攞);
  // 入返 tab 再攞多次做刷新(接受/拒絕完之後嗰啲操作已經自己更新本地
  // state,呢個 refetch 純粹保底同步多裝置嘅改動)。
  const [friendsData, setFriendsData] = useState({ friends: [], incoming: [], outgoing: [] });
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [addFriendVisible, setAddFriendVisible] = useState(false);
  const [sharesFor, setSharesFor] = useState(null); // 揀咗邊個好友睇緊佢分享清單
  const [friendToken, setFriendToken] = useState(null); // 撳咗邊個分享 token,開 SharedPlaylistSheet

  const loadFriends = React.useCallback(() => {
    if (!user) return;
    setFriendsLoading(true);
    friendsList(getToken ? getToken() : null)
      .then((r) => setFriendsData({ friends: r.friends || [], incoming: r.incoming || [], outgoing: r.outgoing || [] }))
      .catch(() => {})
      .finally(() => setFriendsLoading(false));
  }, [user, getToken]);

  useEffect(() => { loadFriends(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'friends') loadFriends(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = (friend) => {
    friendsAccept(getToken ? getToken() : null, friend.user_id)
      .then(loadFriends)
      .catch((e) => Alert.alert('接受失敗', friendsErrorMessage(e, '請再試')));
  };
  // ✕(拒絕/收回)—— 靜靜刪行,對方唔知(§8 問題4);收回自己 outgoing 唔使確認,
  // 拒絕 incoming 都唔使(對方冇通知,冇尷尬)。
  const handleReject = (friend) => {
    friendsDelete(getToken ? getToken() : null, friend.user_id)
      .then(loadFriends)
      .catch((e) => Alert.alert('操作失敗', friendsErrorMessage(e, '請再試')));
  };
  // 解除好友要二次確認(同刪清單一致做法,§3.2)
  const handleUnfriend = (friend) => {
    Alert.alert('解除好友', `同「${friend.username}」解除好友關係?`, [
      { text: '取消', style: 'cancel' },
      {
        text: '解除', style: 'destructive',
        onPress: () => friendsDelete(getToken ? getToken() : null, friend.user_id).then(loadFriends).catch((e) => Alert.alert('操作失敗', friendsErrorMessage(e, '請再試'))),
      },
    ]);
  };
  const showFriendMenu = (friend) => {
    Alert.alert(friend.username, null, [
      { text: '睇分享清單', onPress: () => setSharesFor(friend) },
      { text: '解除好友', style: 'destructive', onPress: () => handleUnfriend(friend) },
      { text: '取消', style: 'cancel' },
    ]);
  };

  // 清單行 ⋯ 掣:得兩個選項,native Alert 夠用,唔使另開 action sheet
  // (同下面帳戶卡登出一致做法)。
  const showPlaylistMenu = (pl) => {
    Alert.alert(pl.name, null, [
      { text: '改名', onPress: () => openRename && openRename(pl) },
      {
        text: '刪除清單', style: 'destructive',
        onPress: () => Alert.alert('刪除清單', `「${pl.name}」同入面 ${pl.songs?.length || 0} 首歌都會刪走。`, [
          { text: '取消', style: 'cancel' },
          { text: '刪除', style: 'destructive', onPress: () => deletePlaylist && deletePlaylist(pl.id) },
        ]),
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  // edge-to-edge:唔加 top inset 個大字標題會同狀態列時間疊埋(見 useInsets.js)
  const insets = useInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {/* PHONE-PASSWORD-AUTH-PLAN §5.4:右上角會員掣,同首頁/詩歌庫一致。 */}
      <View style={styles.headerRow}>
        <Text style={styles.header}>我的</Text>
        <AvatarButton onPress={onOpenAuth} />
      </View>

      {/* 未登入 CTA(§5.4):登入後呢張卡收埋(右上角頭像係入口,同步狀態
          搬咗去 AccountScreen 顯示),但未登入時保留做登入入口,避免新
          用戶搵唔到「我的」頁點樣登入。 */}
      {!user && (
        <TouchableOpacity
          style={[styles.account, styles.accountCta]}
          activeOpacity={0.7}
          onPress={() => onOpenAuth && onOpenAuth()}
        >
          <View style={styles.avatar}>
            <MaterialIcons name="person-outline" size={22} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.accountTitle}>登入 / 註冊</Text>
            <Text style={styles.accountSub}>登入後可以同步最愛同清單</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
      )}

      {/* 最愛 / 清單 切換,admin 多兩粒:URL加歌(action chip,冇 active 態,
          撳落即開 modal)、已下架(真 tab)(MYPAGE-ADMIN-CHIPS-PLAN §4.2)。
          四粒可能爆闊度,外層改 ScrollView horizontal——non-admin 得兩粒,
          冇得撥都冇視覺差異。
          ⚠️ Opus 5 驗收揪出嘅 regression:ScrollView 預設 flexGrow:1/
          flexShrink:1,唔加 style 覆蓋就會同隔籬 FlatList 爭剩餘垂直空間——
          列表短就將呢行撐到成 600px 高、登入 CTA 卡食位就將呢行壓扁切一半。
          `style` 鎖死 flexGrow:0/flexShrink:0(令呢個 ScrollView 淨係貼住
          內容高度),padding/margin 淨係擺喺 contentContainerStyle。 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.segmentScroll}
        contentContainerStyle={styles.segment}
      >
        {[
          { k: 'favorites', label: `最愛 ${favorites.length}`, icon: 'favorite', kind: 'tab' },
          { k: 'playlists', label: `我嘅清單 ${playlists.length}`, icon: 'queue-music', kind: 'tab' },
          // 好友(§3.1)—— 登入先顯示(未登入本身有 CTA 卡引導登入,唔使多個入口);
          // incoming>0 帶紅點,唔出數字。
          ...(user ? [{ k: 'friends', label: '好友', icon: 'group', kind: 'tab', badge: friendsData.incoming.length > 0 }] : []),
          ...(isAdmin ? [
            { k: 'admin-add', label: 'URL加歌', icon: 'add-link', kind: 'action', onPress: () => onOpenAdminAdd && onOpenAdminAdd() },
            { k: 'delisted', label: '已下架', icon: 'visibility-off', kind: 'tab' },
          ] : []),
        ].map((s) => {
          const active = s.kind === 'tab' && tab === s.k;
          return (
            <TouchableOpacity
              key={s.k}
              style={[styles.segItem, active && styles.segItemActive]}
              onPress={s.kind === 'action' ? s.onPress : () => setTab(s.k)}
              activeOpacity={0.7}
            >
              <MaterialIcons name={s.icon} size={16} color={active ? COLORS.background : COLORS.textSecondary} />
              <Text style={[styles.segText, active && styles.segTextActive]}>{s.label}</Text>
              {s.badge ? <View style={styles.segBadge} /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {tab === 'favorites' ? (
        <FlatList
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          // 播全部最愛(Eric 2026-07-25)—— 同首頁「▶ 播全部 N 首」/清單詳情頁一款;
          // explicit: true = 照收藏次序播晒(v231 語義),唔係單曲+隨機接續
          ListHeaderComponent={
            favorites.length ? (
              <TouchableOpacity
                style={styles.playAll}
                onPress={() => onPlayHymn && onPlayHymn(favorites[0], { explicit: true, playlist: favorites })}
                activeOpacity={0.8}
              >
                <MaterialIcons name="play-arrow" size={22} color={COLORS.background} />
                <Text style={styles.playAllText}>播全部 {favorites.length} 首</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            // 撳最愛入面一首歌 = 喺一個清單畫面度揀歌,同「播全部」/清單詳情頁一致
            // 用 explicit + playlist(唔係散歌插播),照最愛次序接落去。
            <TouchableOpacity style={styles.row} onPress={() => onPlayHymn && onPlayHymn(item, { explicit: true, playlist: favorites })} activeOpacity={0.7}>
              <Cover youtubeId={item.youtube_id} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={2}>{getDisplayTitle(item)}</Text>
                <Text style={styles.rowArtist} numberOfLines={1}>{item.artist || '未知'}</Text>
              </View>
              {/* ≡♪ 加入到清單 —— 彈揀清單 sheet(同播放頁「清單」pill 一致),唔使入返播放頁 */}
              <TouchableOpacity onPress={() => openAddToPlaylist(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.rowAction}>
                <MaterialIcons name="playlist-add" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleFavorite && toggleFavorite(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.rowAction}>
                {/* §5.2 心心着燈用生命綠 */}
                <MaterialIcons name="favorite" size={22} color={COLORS.accent} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="favorite-border" size={40} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>仲未有最愛</Text>
              <Text style={styles.emptyHint}>喺播放頁撳心心就會加入呢度</Text>
            </View>
          }
        />
      ) : tab === 'delisted' ? (
        delistedLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : (
          <FlatList
            data={delisted}
            keyExtractor={(item) => String(item.hymn.id)}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => (
              // 落咗架嘅歌唔俾撳播放(§4.3)——純顯示,唔用 TouchableOpacity。
              <View style={styles.row}>
                <Cover youtubeId={item.hymn.youtube_id} />
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{getDisplayTitle(item.hymn)}</Text>
                  <Text style={styles.rowArtist} numberOfLines={1}>{item.hymn.artist || '未知'}</Text>
                  <Text style={styles.delistedDate}>{(item.delisted_at || '').slice(0, 10)} 落架</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons name="visibility-off" size={40} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>未有落架嘅歌</Text>
                <Text style={styles.emptyHint}>喺詩歌庫長按一首歌可以落架</Text>
              </View>
            }
          />
        )
      ) : tab === 'friends' ? (
        friendsLoading && !friendsData.friends.length && !friendsData.incoming.length && !friendsData.outgoing.length ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : (
          <FlatList
            // §3.2:三段式,一個 FlatList 搞掂——攤平做一個 data array,靠 _type
            // 分流 renderItem。段落次序:好友請求(有先出)/ 我嘅好友 / 等緊接受(有先出)。
            data={[
              ...(friendsData.incoming.length ? [
                { _type: 'header', key: 'h-incoming', title: `好友請求(${friendsData.incoming.length})` },
                ...friendsData.incoming.map((f) => ({ _type: 'incoming', ...f })),
              ] : []),
              ...(friendsData.friends.length ? [
                { _type: 'header', key: 'h-friends', title: '我嘅好友' },
                ...friendsData.friends.map((f) => ({ _type: 'friend', ...f })),
              ] : []),
              ...(friendsData.outgoing.length ? [
                { _type: 'header', key: 'h-outgoing', title: '等緊對方接受' },
                ...friendsData.outgoing.map((f) => ({ _type: 'outgoing', ...f })),
              ] : []),
            ]}
            keyExtractor={(item, idx) => item.key || `${item._type}_${item.user_id ?? idx}`}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListHeaderComponent={
              <TouchableOpacity style={styles.newRow} onPress={() => setAddFriendVisible(true)} activeOpacity={0.7}>
                <MaterialIcons name="person-add" size={22} color={COLORS.accent} />
                <Text style={styles.newText}>加好友</Text>
              </TouchableOpacity>
            }
            renderItem={({ item }) => {
              if (item._type === 'header') return <Text style={styles.sectionHeader}>{item.title}</Text>;
              const initial = (item.username || '?').charAt(0).toUpperCase();
              if (item._type === 'incoming') {
                return (
                  <View style={styles.row}>
                    <View style={styles.friendAvatar}><Text style={styles.friendAvatarText}>{initial}</Text></View>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{item.username}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleAccept(item)} style={styles.pillBtn} activeOpacity={0.75}>
                      <Text style={styles.pillBtnText}>接受</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleReject(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.rowAction}>
                      <MaterialIcons name="close" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                );
              }
              if (item._type === 'outgoing') {
                return (
                  <View style={styles.row}>
                    <View style={styles.friendAvatar}><MaterialIcons name="person-outline" size={20} color={COLORS.textSecondary} /></View>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>尾號 {item.phone_tail}(等緊接受)</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleReject(item)} style={styles.pillBtnOutline} activeOpacity={0.75}>
                      <Text style={styles.pillBtnOutlineText}>收回</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
              // friend
              return (
                <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => setSharesFor(item)}>
                  <View style={styles.friendAvatar}><Text style={styles.friendAvatarText}>{initial}</Text></View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.username}</Text>
                  </View>
                  <TouchableOpacity onPress={() => showFriendMenu(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.rowAction}>
                    <MaterialIcons name="more-vert" size={22} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons name="group" size={40} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>仲未有好友</Text>
                <Text style={styles.emptyHint}>撳上面「加好友」用電話號碼搵朋友</Text>
              </View>
            }
          />
        )
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          // ＋新清單擺列表最頂:同 AddToPlaylistSheet 底部嗰行同字眼同視覺,
          // 空狀態都有入口;唔加喺 chip 度(目標區太細,又同切 tab 撈亂語義)。
          ListHeaderComponent={
            <TouchableOpacity style={styles.newRow} onPress={() => openCreate && openCreate()} activeOpacity={0.7}>
              <MaterialIcons name="add" size={22} color={COLORS.accent} />
              <Text style={styles.newText}>新播放清單</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            // ⚠️ 資料模型係 item.songs(PlaylistsContext/MMKV)—— 之前寫咗 item.hymns
            // (舊 PlaylistContext 嘅形狀),搞到首數永遠顯示 0、撳極都冇反應。
            <TouchableOpacity style={styles.row} activeOpacity={0.7}
              onPress={() => setDetailId(item.id)}>
              <View style={[styles.cover, styles.plCover]}>
                <MaterialIcons name="queue-music" size={26} color={COLORS.textSecondary} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rowArtist}>{item.songs?.length || 0} 首</Text>
              </View>
              <TouchableOpacity onPress={() => showPlaylistMenu(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.rowAction}>
                <MaterialIcons name="more-vert" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialIcons name="queue-music" size={40} color={COLORS.textSecondary} />
              <Text style={styles.emptyText}>仲未有清單</Text>
              <Text style={styles.emptyHint}>撳上面「＋新播放清單」開一個{'\n'}喺播放頁撳「清單」都可以加歌</Text>
            </View>
          }
        />
      )}

      {/* B9 — PlaylistDetailSheet 係獨立 native Modal,冇 TabBar 陪住,mini player
          由 App.js 傳落嚟(避免呢度反過來 import App.js 撞 circular import,
          見 App.js handleOpenFullScreen 上面嗰段註解)。 */}
      <PlaylistDetailSheet playlistId={detailId} onClose={() => setDetailId(null)} onPlayHymn={onPlayHymn}
        onOpenAuth={onOpenAuth} miniPlayer={miniPlayer} hasMiniPlayer={hasMiniPlayer} />

      {/* 好友(§3.2)—— 加好友 sheet、好友分享清單列表、撳入去開現成 SharedPlaylistSheet */}
      <AddFriendSheet visible={addFriendVisible} onClose={() => setAddFriendVisible(false)} onRequested={loadFriends} />
      <FriendSharesSheet friend={sharesFor} onClose={() => setSharesFor(null)}
        onOpenToken={(token) => { setSharesFor(null); setFriendToken(token); }} />
      <SharedPlaylistSheet token={friendToken} onClose={() => setFriendToken(null)} onPlayHymn={onPlayHymn}
        miniPlayer={miniPlayer} hasMiniPlayer={hasMiniPlayer} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  header: { ...TYPOGRAPHY.title },
  account: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 16, padding: 12,
    backgroundColor: COLORS.card, borderRadius: 12,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.cardLight, alignItems: 'center', justifyContent: 'center',
  },
  // 未登入卡加 1px 邊做 CTA 感(§2.3),唔好成塊變 accent 色
  accountCta: { borderWidth: 1, borderColor: COLORS.border },
  accountTitle: { ...TYPOGRAPHY.body, fontWeight: '600' },
  accountSub: { ...TYPOGRAPHY.artist, marginTop: 2 },
  // flexGrow:0/flexShrink:0 —— 蓋過 ScrollView 預設嘅 {flexGrow:1,flexShrink:1},
  // 唔係就會同隔籬 FlatList 爭垂直空間(Opus 5 驗收揪出嘅 regression)。
  segmentScroll: { flexGrow: 0, flexShrink: 0 },
  segment: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12 },
  segItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    backgroundColor: COLORS.card, marginRight: 8,
  },
  segItemActive: { backgroundColor: COLORS.accent },
  segText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600', marginLeft: 5 },
  segTextActive: { color: COLORS.background },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  rowAction: { paddingLeft: 14 },
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight },
  plCover: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1, marginLeft: 12 },
  rowTitle: { ...TYPOGRAPHY.songTitle },
  rowArtist: { ...TYPOGRAPHY.artist, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, marginTop: 8 },
  emptyHint: { ...TYPOGRAPHY.artist, marginTop: 4, textAlign: 'center', lineHeight: 20 },
  loadingWrap: { alignItems: 'center', paddingTop: 60 },
  // 已下架 row 副行「幾時落架」
  delistedDate: { ...TYPOGRAPHY.artist, marginTop: 2, fontSize: 12 },
  // ＋新播放清單(視覺照 AddToPlaylistSheet 嘅 newRow/newText)
  newRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  newText: { color: COLORS.accent, marginLeft: 8, fontSize: 15, fontWeight: '700' },
  // 播全部最愛 pill(視覺照 PlaylistDetailSheet 嘅 playAll)
  playAll: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 18, paddingVertical: 9,
    backgroundColor: COLORS.accent, borderRadius: 20,
  },
  playAllText: { color: COLORS.background, fontWeight: '700', fontSize: 15, marginLeft: 4 },
  // 好友 chip 紅點(§3.1,incoming>0 先出,唔出數字)
  segBadge: {
    position: 'absolute', top: 4, right: 6,
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger,
  },
  // 好友 tab(§3.2)
  sectionHeader: { ...TYPOGRAPHY.artist, fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  friendAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.cardLight, alignItems: 'center', justifyContent: 'center',
  },
  friendAvatarText: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  pillBtn: { backgroundColor: COLORS.accent, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, marginLeft: 8 },
  pillBtnText: { color: COLORS.background, fontWeight: '700', fontSize: 13 },
  pillBtnOutline: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  pillBtnOutlineText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 13 },
});
