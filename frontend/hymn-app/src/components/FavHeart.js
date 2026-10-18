// 共用清單心心掣(ODELY-OPT 階段③ 4a):取代 Library/HymnList/HomeScreen 三份逐字重複嘅 Heart。
// 喺清單度直接加/移最愛,唔使入返播放頁。stopPropagation 避免連埋整行觸發播歌;
// hitSlop 10 撐大觸控範圍。style 由呼叫方傳(Library/HymnList: paddingLeft 14;Home: cardHeart/rowHeart)。
// 播放器用嘅 App.js FavHeart(hitSlop 12 + paddingVertical 2 + 舊色常數)視覺唔同,刻意唔併。
import React from 'react';
import { TouchableOpacity } from 'react-native';
import OdeIcon from '../icons/OdeIcon';
import { COLORS } from '../theme/designSystem';
import { useFavorites } from '../context/FavoritesContext';

export default function FavHeart({ hymn, style, size = 20 }) {
  const { isFavorite, toggleFavorite } = useFavorites() || {};
  if (!hymn?.id || typeof toggleFavorite !== 'function') return null;
  const on = typeof isFavorite === 'function' ? isFavorite(hymn.id) : false;
  return (
    <TouchableOpacity
      onPress={(e) => { e?.stopPropagation?.(); toggleFavorite(hymn); }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={style}
      activeOpacity={0.6}
    >
      <OdeIcon
        name="heart"
        size={size}
        filled={on}
        color={on ? COLORS.primary : COLORS.textSecondary}
      />
    </TouchableOpacity>
  );
}
