// 共用封面縮圖(ODELY-OPT 階段③ 4a):取代 Mine/Library/HymnList/PlaylistDetail/
// SharedPlaylist/AdminAddHymn 六份逐字重複嘅本地 Cover。
// - youtubeId 變咗要重試新縮圖(BATCH5 S6,舊版 failed 唔會自動清)。
// - fallback 用向量圖標 <OdeIcon name="musicNote">,唔用 Emoji(§5.4)。
// - size 預設 52;iconScale 預設 0.5(HymnListScreen 原本用 0.42,照傳保持像素一致)。
// 播放器用嘅 App.js CoverImage(style 驅動、getAlbumCoverUrl)API 唔同,刻意唔併。
import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import { COLORS, effects } from '../theme/designSystem';

export default function CoverImage({ youtubeId, size = 52, iconScale = 0.5, style }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [youtubeId]);
  const uri = youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null;
  if (!uri || failed) {
    return (
      <View style={[styles.cover, { width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        <OdeIcon name="musicNote" size={size * iconScale} color={COLORS.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.cover, { width: size, height: size }, style]} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  cover: { borderRadius: 6, backgroundColor: COLORS.cardLight, ...effects.coverInset },
});
