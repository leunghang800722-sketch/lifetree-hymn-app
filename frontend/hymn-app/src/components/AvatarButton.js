// AvatarButton — 三頁(首頁/詩歌庫/我的)右上角統一嘅會員掣
// (PHONE-PASSWORD-AUTH-PLAN §5.4)。
//
// 首頁 header(App.js ~L1341)本身已經有呢個 36px 圓形頭像掣,呢度純粹
// 抽出嚟做共用 component,style 照搬 App.js 嘅 hs.avatarBtn/hs.avatarText,
// 冚埋 LibraryScreen/MineScreen 都用返同一個,三頁掣一致。
//
// 顯示邏輯(同 MineScreen/AccountScreen 現成 fallback 鏈一致):
//   已登入 → (username || phone尾4 || '?') 嘅第一個字大寫
//            (username=NULL 嘅過渡用戶會顯示尾號嘅第一個數字,唔係「?」)
//   未登入 → person-outline icon
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { COLORS } from '../theme/designSystem';
import { useAuth } from '../context/AuthContext';

export default function AvatarButton({ onPress }) {
  const { user } = useAuth() || {};

  return (
    <TouchableOpacity style={styles.avatarBtn} onPress={onPress} activeOpacity={0.75}>
      {user ? (
        <Text style={styles.avatarText}>
          {(user.username || user.phone?.slice(-4) || '?').charAt(0).toUpperCase()}
        </Text>
      ) : (
        <MaterialIcons name="person-outline" size={20} color={COLORS.textPrimary} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.background,
  },
});
