// SheetShell —— 8 個底部/置中面板共用嘅殼(SHEETSHELL-EXEC-20260906)。
//
// 觸發 bug:Android「加入到清單」sheet(AddToPlaylistSheet)滑唔到收起——
// 根源(ROOTCAUSE §C5)係每個面板自己抄一套 Modal+backdrop+手勢,抄漏咗
// 手勢嗰份(AddToPlaylistSheet 原本淨係得 backdrop tap 可以閂,冇 RNGH Pan)。
// 09-05 AdminPresenceSheet 已經驗證過一套做法(RNGH Pan,唔係 PanResponder——
// New Architecture + idb 合成觸控完全收唔到 PanResponder 嘅 move 事件),
// 呢度將嗰套抽做共用殼,8 個面板全部換用,同一時間修晒。
//
// 三個 variant:
//   bottom      —— 貼底 sheet:handle + 標題列(可選)+ ✕(可選),RNGH
//                   Gesture.Pan()下滑收起(translationY>60 或 velocityY>500),
//                   backdrop(flex:1,唔用 absoluteFillObject——07-29 已證實
//                   absoluteFillObject 收唔到 touch)撳一下都收起。
//   center      —— 置中 dialog(AddToPlaylistSheet create/rename、AddFriendSheet
//                   果種):無手勢,fade;上下兩嚿 flex:1 backdrop 令 card
//                   企正中(同一個 07-29 已驗證做法,唔靠 justifyContent:
//                   'center' 或者 absoluteFillObject)。
//   fullscreen  —— ⚠️呢個唔喺 SHEETSHELL-EXEC §1 原設計嘅 variant enum 度
//                   (原設計淨係 bottom/center)。遷移 #6 SharedPlaylistSheet /
//                   #7 PlaylistDetailSheet 嗰陣加嘅:呢兩版本身係全屏頁面
//                   (自己有 back 掣 + 客製標題列,現時 Modal 冇 `transparent`、
//                   冇 backdrop、冇 handle),原設計嘅 bottom variant 嘅
//                   backdrop+圓角 card+handle 會令佢哋變成浮動卡片,違反
//                   遷移清單 #6/#7 自己嘅批註「核對現時視覺,照原樣」。
//                   fullscreen 淨係提供 Modal + GestureHandlerRootView +
//                   統一嘅 Android translucent props,唔畫任何 chrome,
//                   避免同呢兩版自己嘅 header 打交。詳細理由見
//                   SHEETSHELL-REPORT-20260906.md。
//
// Android Modal 陷阱(執行單 §0 紅線,唔准拆):
//   (a) backdrop 一定 flex:1,唔可以 absoluteFillObject。
//   (b) statusBarTranslucent + navigationBarTranslucent 一定要一齊落,
//       否則 Modal 呢個獨立 window 唔會同 activity(edge-to-edge)嘅座標
//       系對齊,鍵盤/導航列位置會錯(AddToPlaylistSheet 09-05 前嘅病史)。
//   (c) 唔用 KeyboardAvoidingView 喺 Android——keyboardAware 用
//       keyboardDidShow 手動抬高 card(AddToPlaylistSheet 現有做法)。
//   (d) native <Modal> 係獨立 window,呢度自己再包一層
//       GestureHandlerRootView(RNGH 官方要求,09-05 已證實)。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Keyboard } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import OdeIcon from '../icons/OdeIcon';
import { COLORS } from '../theme/designSystem';
import { useInsets } from '../hooks/useInsets';

// AddToPlaylistSheet 原有數值(07-29 已驗證,搬過嚟唔變):Android
// keyboardDidShow 高度有時漏咗建議列/emoji 工具列,留少少 buffer;
// keyboardScrim 貼實 window 底,大到蓋晒任何殘餘計算誤差都冇代價
// (一定俾真.系統鍵盤蓋住,belt-and-braces)。
const KB_SAFETY_BUFFER = 12;
const KB_SCRIM_HEIGHT = 140;
// 下滑收起門檻(AdminPresenceSheet.js 已驗證嘅數值,原封不動搬過嚟)。
const DRAG_CLOSE_PX = 60;
const DRAG_CLOSE_VELOCITY = 500;
const DRAG_CLOSE_DURATION = 160;
const DRAG_CLOSE_DISTANCE = 600;

export default function SheetShell({
  visible,
  onClose,
  variant = 'bottom',
  title,
  showClose = true,
  keyboardAware = false,
  maxHeight = '80%',
  dismissOnBackdrop = true,
  scrollable = true,
  cardStyle,
  children,
}) {
  const insets = useInsets();
  const [kbHeight, setKbHeight] = useState(0);

  // keyboardAware 淨係 bottom variant 用(center 冇 FlatList,鍵盤唔會遮到
  // 置中內容,AddToPlaylistSheet create/rename 原本已經冇做呢層)。
  useEffect(() => {
    if (!keyboardAware || variant !== 'bottom') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates?.height || 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [keyboardAware, variant]);

  // 下滑收起(AdminPresenceSheet.js:74-84 已驗證做法)——RNGH native 手勢,
  // 唔用 PanResponder(New Architecture + idb 合成觸控完全收唔到 move 事件,
  // 09-06 AdminPresenceSheet 註解已記低)。手勢細,唔追求 60fps 跟手,
  // runOnJS(true) 用 JS 線程 callback 夠。
  const dragY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const closeSheet = useCallback(() => {
    Animated.timing(dragY, { toValue: DRAG_CLOSE_DISTANCE, duration: DRAG_CLOSE_DURATION, useNativeDriver: true }).start(() => {
      dragY.setValue(0);
      onCloseRef.current && onCloseRef.current();
    });
  }, [dragY]);
  const dragGesture = useMemo(() => Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .runOnJS(true)
    .onUpdate((e) => { if (e.translationY > 0) dragY.setValue(e.translationY); })
    .onEnd((e) => {
      if (e.translationY > DRAG_CLOSE_PX || e.velocityY > DRAG_CLOSE_VELOCITY) closeSheet();
      else Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
    })
    .onFinalize((_e, success) => { if (!success) Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start(); }),
  [dragY, closeSheet]);

  if (!visible) return null;

  const header = (title || showClose) ? (
    <View style={styles.titleRow}>
      {!!title && <Text style={styles.title} numberOfLines={1}>{title}</Text>}
      {showClose && (
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.closeBtn} accessibilityLabel="關閉">
          <OdeIcon name="close" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  // fullscreen —— 淨係 Modal + GestureHandlerRootView,唔畫任何 chrome
  // (見檔頭批註,呢個 variant 唔喺原設計 enum 度)。
  if (variant === 'fullscreen') {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
        <GestureHandlerRootView style={styles.fullscreenRoot}>
          {children}
        </GestureHandlerRootView>
      </Modal>
    );
  }

  if (variant === 'center') {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
        <GestureHandlerRootView style={styles.fullscreenRoot}>
          <View style={styles.centerScrim}>
            {/* 上下兩嚿 flex:1 backdrop 令 card 企正中(07-29 已驗證,唔用
                absoluteFillObject——嗰種寫法收唔到 touch,AddToPlaylistSheet
                三個 mode 撳空白位閂全部失靈過)。 */}
            <TouchableOpacity style={styles.flexFill} activeOpacity={1} onPress={dismissOnBackdrop ? onClose : undefined} />
            <View style={[styles.centerCard, cardStyle]}>
              {header}
              {children}
            </View>
            <TouchableOpacity style={styles.flexFill} activeOpacity={1} onPress={dismissOnBackdrop ? onClose : undefined} />
          </View>
        </GestureHandlerRootView>
      </Modal>
    );
  }

  // variant === 'bottom'
  const handleAndHeader = (
    <View>
      <View style={styles.handle} />
      {header}
    </View>
  );

  const cardInner = (
    <>
      {scrollable ? (
        <GestureDetector gesture={dragGesture}>
          {handleAndHeader}
        </GestureDetector>
      ) : handleAndHeader}
      {children}
    </>
  );

  const card = (
    <Animated.View
      style={[
        styles.bottomCard,
        { maxHeight, paddingBottom: insets.bottom + 16 },
        keyboardAware && kbHeight > 0 ? { marginBottom: kbHeight + KB_SAFETY_BUFFER } : null,
        { transform: [{ translateY: dragY }] },
        cardStyle,
      ]}
    >
      {cardInner}
    </Animated.View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={styles.bottomScrim}>
        <TouchableOpacity style={styles.flexFill} activeOpacity={1} onPress={dismissOnBackdrop ? onClose : undefined} />
        {keyboardAware && kbHeight > 0 && <View pointerEvents="none" style={styles.keyboardScrim} />}
        {scrollable ? card : (
          <GestureDetector gesture={dragGesture}>
            {card}
          </GestureDetector>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  bottomScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  keyboardScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: KB_SCRIM_HEIGHT, backgroundColor: COLORS.card },
  bottomCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingTop: 4 },
  centerScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  centerCard: { alignSelf: 'center', width: '86%', maxWidth: 420, backgroundColor: COLORS.card, borderRadius: 20, paddingBottom: 14 },
  fullscreenRoot: { flex: 1 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: COLORS.textSecondary, alignSelf: 'center', marginTop: 8, marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  title: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '700', paddingVertical: 12 },
  closeBtn: { position: 'absolute', right: 0, padding: 6 },
});
