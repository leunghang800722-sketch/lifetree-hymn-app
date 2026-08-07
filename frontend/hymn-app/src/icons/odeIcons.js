// Ode icon set — 24×24 grid, stroke 1.75, round cap/join
// 用法（react-native-svg）：
//   import Svg, { Path, Circle, Rect } from 'react-native-svg';
//   import { ODE_ICONS } from './odeIcons';
//   <OdeIcon name="heart" size={24} color={iconState.idle} filled />
//
// 每個 icon 有 stroke 版 (s) 同／或 fill 版 (f)。
// s = 描邊路徑（stroke=color, fill=none, strokeWidth 1.75）
// f = 實心路徑（fill=color, 無 stroke）
// shapes = 額外圖元（circle / rect），attrs 照 SVG 名。

export const STROKE_WIDTH = 1.75;
export const VIEWBOX = '0 0 24 24';

export const ODE_ICONS = {
  // ── 播放器動作 ───────────────────────────────
  heart: {
    s: ['M12 20.4C12 20.4 3.6 15.1 3.6 9.6A4.6 4.6 0 0 1 12 7.1A4.6 4.6 0 0 1 20.4 9.6C20.4 15.1 12 20.4 12 20.4Z'],
    f: ['M12 20.4C12 20.4 3.6 15.1 3.6 9.6A4.6 4.6 0 0 1 12 7.1A4.6 4.6 0 0 1 20.4 9.6C20.4 15.1 12 20.4 12 20.4Z'],
    note: '未收藏 = s + #C3BADF；已收藏 = f + #B9A6F2',
  },
  lyrics: {
    s: ['M7.2 9.4h6.4M7.2 12.8h9.6M7.2 16.2h4.8'],
    shapes: [{ type: 'rect', x: 3.6, y: 4.6, width: 16.8, height: 14.8, rx: 2.6 }],
    note: '冇歌詞時整個 icon + label opacity 0.4，唔換色',
  },
  share: {
    s: ['M8.4 10.9 15.6 7.3M8.4 13.1 15.6 16.7'],
    shapes: [
      { type: 'circle', cx: 17.8, cy: 6.2, r: 2.4 },
      { type: 'circle', cx: 6.2, cy: 12, r: 2.4 },
      { type: 'circle', cx: 17.8, cy: 17.8, r: 2.4 },
    ],
  },
  queue: {
    s: ['M3.8 7h11M3.8 12h11M3.8 17h6.6', 'M19.8 16.4V8.2'],
    shapes: [{ type: 'circle', cx: 17.6, cy: 16.4, r: 2.2 }],
    note: '播放清單 / 我嘅清單共用',
  },
  shuffle: {
    s: [
      'M4 7.4h2.6c1 0 1.7.5 2.3 1.4l5.2 7.4c.6.9 1.3 1.4 2.3 1.4H20M4 16.6h2.6c1 0 1.7-.5 2.3-1.4l1.4-2M14.1 8.8l1.3-1.9c.6-.9 1.3-1.4 2.3-1.4H20',
      'M17.8 3.6 20 5.5 17.8 7.4M17.8 15.9 20 17.8 17.8 19.7',
    ],
    note: '未開 #8F88AB；開咗 #EFE4D2',
  },
  repeat: {
    s: [
      'M7.6 5.8h8.8a3.4 3.4 0 0 1 3.4 3.4v2.4M16.4 18.2H7.6a3.4 3.4 0 0 1-3.4-3.4v-2.4',
      'M9.8 3.6 7.6 5.8 9.8 8M14.2 20.4 16.4 18.2 14.2 16',
    ],
    note: '單曲循環 = 同一圖中間疊一個 Sora 200 「1」，唔另畫',
  },
  prev: {
    f: ['M15.6 6.4a.9.9 0 0 0-1.4-.75L7.6 11.25a.9.9 0 0 0 0 1.5l6.6 5.6a.9.9 0 0 0 1.4-.75Z'],
    shapes: [{ type: 'rect', x: 5.2, y: 5.6, width: 1.9, height: 12.8, rx: 0.95, fill: true }],
  },
  next: {
    f: ['M8.4 6.4a.9.9 0 0 1 1.4-.75l6.6 5.6a.9.9 0 0 1 0 1.5l-6.6 5.6a.9.9 0 0 1-1.4-.75Z'],
    shapes: [{ type: 'rect', x: 16.9, y: 5.6, width: 1.9, height: 12.8, rx: 0.95, fill: true }],
  },
  play: { f: ['M8.6 5.7a.9.9 0 0 1 1.35-.78l8.1 5.3a.9.9 0 0 1 0 1.56l-8.1 5.3A.9.9 0 0 1 8.6 16.3Z'] },
  pause: {
    shapes: [
      { type: 'rect', x: 7.4, y: 5.4, width: 3.3, height: 13.2, rx: 1.3, fill: true },
      { type: 'rect', x: 13.3, y: 5.4, width: 3.3, height: 13.2, rx: 1.3, fill: true },
    ],
    note: '主掣 76dp 圓 #EFE4D2 底，圖形 #1C1436，26dp',
  },
  playSmall: { f: ['M8.8 6.1a.9.9 0 0 1 1.36-.77l7.4 5.9a.9.9 0 0 1 0 1.54l-7.4 5.9A.9.9 0 0 1 8.8 17.9Z'], note: '列表行用 18dp' },

  // ── Tab bar（22dp）─────────────────────────
  home: {
    s: ['M3.9 10.7 12 4.1l8.1 6.6v8.1a1.4 1.4 0 0 1-1.4 1.4H5.3a1.4 1.4 0 0 1-1.4-1.4Z', 'M9.6 20.2v-5.4h4.8v5.4'],
    f: ['M11.1 3.6a1.4 1.4 0 0 1 1.8 0l7.1 6a1.4 1.4 0 0 1 .5 1.1v8.1a1.6 1.6 0 0 1-1.6 1.6h-4.3v-5.3h-3.2v5.3H5.1a1.6 1.6 0 0 1-1.6-1.6v-8.1a1.4 1.4 0 0 1 .5-1.1Z'],
  },
  library: {
    s: ['M12.9 15.4V8.2l3.8-1.1v2.4l-3.8 1.1'],
    shapes: [
      { type: 'rect', x: 3.5, y: 3.5, width: 17, height: 17, rx: 3.2 },
      { type: 'circle', cx: 10.6, cy: 15.4, r: 2.3 },
    ],
    f: ['M6.4 3.4h11.2a3 3 0 0 1 3 3v11.2a3 3 0 0 1-3 3H6.4a3 3 0 0 1-3-3V6.4a3 3 0 0 1 3-3Zm7.2 3.5a.9.9 0 0 0-1.1.9v5.6a2.5 2.5 0 1 0 1.8 2.4V10.3l2.3-.7a.9.9 0 0 0 .6-.9V7.3a.9.9 0 0 0-1.1-.9Z'],
  },
  me: {
    s: ['M5.2 19.6c1-3.3 3.6-5.2 6.8-5.2s5.8 1.9 6.8 5.2'],
    shapes: [{ type: 'circle', cx: 12, cy: 8.4, r: 3.6 }],
    f: ['M12 13.4c-3.6 0-6.5 2.1-7.4 5.3a1.2 1.2 0 0 0 1.2 1.5h12.4a1.2 1.2 0 0 0 1.2-1.5c-.9-3.2-3.8-5.3-7.4-5.3Z'],
    fShapes: [{ type: 'circle', cx: 12, cy: 8.2, r: 3.8, fill: true }],
    note: '選中 = f + #EFE4D2；未選 = s + #8F88AB',
  },

  // ── 列表 / 搜尋（18–20dp）──────────────────
  addToList: { s: ['M3.6 7h10.8M3.6 12h8M3.6 17h6.4', 'M17.8 10.6v6.6M14.5 13.9h6.6'], note: '取代舊嘅 ≡₊' },
  addedToList: { s: ['M3.6 7h10.8M3.6 12h8M3.6 17h6.4', 'M14.8 13.8 17.2 16.2 21.2 11.8'], note: '加入成功後顯示 1.2 秒再淡回 addToList' },
  search: { s: ['M15.6 15.6 20.2 20.2'], shapes: [{ type: 'circle', cx: 10.9, cy: 10.9, r: 6.3 }] },
  more: {
    shapes: [
      { type: 'circle', cx: 12, cy: 5.6, r: 1.7, fill: true },
      { type: 'circle', cx: 12, cy: 12, r: 1.7, fill: true },
      { type: 'circle', cx: 12, cy: 18.4, r: 1.7, fill: true },
    ],
  },

  // ── 我的頁（22dp）──────────────────────────
  synced: { s: ['M6.6 17.8h10.2a3.6 3.6 0 0 0 .4-7.2 5.4 5.4 0 0 0-10.3-1.3 3.8 3.8 0 0 0-.3 8.5Z', 'M9.6 13.4 11.5 15.3 15 11.6'], note: '同步中：改用 1.2s 轉動嘅開口環，唔用雲' },
  invite: {
    s: ['M3.8 12.4h16.4M12 8.4v11.2', 'M12 8.4 9.4 5.8a1.9 1.9 0 1 1 2.6-1.3M12 8.4l2.6-2.6a1.9 1.9 0 1 0-2.6-1.3'],
    shapes: [{ type: 'rect', x: 3.8, y: 8.4, width: 16.4, height: 11.2, rx: 2.2 }],
  },
  logout: { s: ['M14.6 4.4H7.4a2.4 2.4 0 0 0-2.4 2.4v10.4a2.4 2.4 0 0 0 2.4 2.4h7.2', 'M12.6 12h8M17.6 8.8 20.8 12 17.6 15.2'], note: '唯一用 #E8896D' },
  about: { s: ['M12 11v5.4'], shapes: [{ type: 'circle', cx: 12, cy: 12, r: 8.4 }, { type: 'circle', cx: 12, cy: 7.9, r: 0.9, fill: true }] },
  gender: {
    s: ['M5.4 19.6c.6-2.6 1.9-4 3.6-4s3 1.4 3.6 4', 'M14.2 19.6c.4-1.8 1.2-3 2.4-3s2 1.2 2.4 3'],
    shapes: [{ type: 'circle', cx: 9, cy: 7.4, r: 2.6 }, { type: 'circle', cx: 16.6, cy: 7.4, r: 2.6 }],
  },
  birthYear: { s: ['M4 11h16M8.8 3.6v3.4M15.2 3.6v3.4'], shapes: [{ type: 'rect', x: 4, y: 6.6, width: 16, height: 13.4, rx: 2.4 }] },

  // ── 導航 / 通用（Claude Code 補齊）─────────────
  chevronRight: { s: ['M9.6 5.4 16.2 12 9.6 18.6'], note: '列表右箭頭，14–16dp，#6A6390' },
  chevronLeft: { s: ['M14.4 5.4 7.8 12 14.4 18.6'] },
  chevronDown: { s: ['M5.4 9.6 12 16.2 18.6 9.6'], note: '播放器收起' },
  chevronUp: { s: ['M5.4 14.4 12 7.8 18.6 14.4'], note: '播放清單展開' },
  back: { s: ['M19.2 12H5.4', 'M11 5.4 4.6 12 11 18.6'] },
  close: { s: ['M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6'], note: '歌詞頁 / 個人資料 / sheet' },
  plus: { s: ['M12 5.2v13.6M5.2 12h13.6'], note: '新播放清單，配 #B9A6F2' },
  check: { s: ['M5.6 12.8 10 17.2 18.4 7.6'], note: '已選 / 已同步 badge' },
  trash: {
    s: ['M4.8 7.4h14.4', 'M9.6 7.4V5.6a1.2 1.2 0 0 1 1.2-1.2h2.4a1.2 1.2 0 0 1 1.2 1.2v1.8', 'M6.6 7.4l.9 11.2a1.6 1.6 0 0 0 1.6 1.4h5.8a1.6 1.6 0 0 0 1.6-1.4l.9-11.2', 'M10.4 11v5.6M13.6 11v5.6'],
    note: '刪除清單 / 移除歌曲，用 #E8896D',
  },
  edit: { s: ['M4.8 19.2h3.2L18.4 8.6a1.9 1.9 0 0 0-2.7-2.7L5.1 16.1Z', 'M14.4 7.2 17.8 10.6'], note: '清單改名' },
  sort: { s: ['M4.6 7h9M4.6 12h6.6M4.6 17h4', 'M16.8 6.6v10.8M13.8 14.4 16.8 17.4 19.8 14.4'], note: '排序 / 篩選' },
  dragHandle: { s: ['M6.4 9.4h11.2M6.4 14.6h11.2'], note: '播放清單拖動排序（取代舊「=」）' },
  nowPlaying: {
    shapes: [
      { type: 'rect', x: 5.4, y: 10.4, width: 2.8, height: 8, rx: 1.4, fill: true },
      { type: 'rect', x: 10.6, y: 6, width: 2.8, height: 12.4, rx: 1.4, fill: true },
      { type: 'rect', x: 15.8, y: 12.6, width: 2.8, height: 5.8, rx: 1.4, fill: true },
    ],
    note: '正在播放；三條 bar 以 0.9s ease-in-out 交替縮放，色 #EFE4D2（原本綠色）',
  },
  stop: { shapes: [{ type: 'rect', x: 6.6, y: 6.6, width: 10.8, height: 10.8, rx: 2.2, fill: true }], note: '通知欄控制' },
  link: {
    s: ['M10.4 13.6a3.4 3.4 0 0 0 4.8 0l2.6-2.6a3.4 3.4 0 0 0-4.8-4.8l-1 1', 'M13.6 10.4a3.4 3.4 0 0 0-4.8 0l-2.6 2.6a3.4 3.4 0 0 0 4.8 4.8l1-1'],
    note: 'URL 加歌',
  },
  friends: {
    s: ['M3.8 19.6c.9-3.1 2.9-4.8 5.6-4.8s4.7 1.7 5.6 4.8', 'M15.6 14.6c2.3.4 3.9 2 4.6 5'],
    shapes: [{ type: 'circle', cx: 9.4, cy: 8.4, r: 3.2 }, { type: 'circle', cx: 17.4, cy: 8.8, r: 2.4 }],
    note: '好友 chip',
  },
  playlistTile: {
    s: ['M7.4 8.4h7.2M7.4 11.6h4.8', 'M16.2 15.4V9.6'],
    shapes: [{ type: 'rect', x: 3.6, y: 3.6, width: 16.8, height: 16.8, rx: 3.4 }, { type: 'circle', cx: 14, cy: 15.4, r: 2.2 }],
    note: '清單封面佔位（48–76dp，底 #221B3E）',
  },
  clock: { s: ['M12 7.6V12l3.2 2'], shapes: [{ type: 'circle', cx: 12, cy: 12, r: 8.4 }], note: '最近聽過 / 播放記錄' },
  bell: { s: ['M12 4.2a5.4 5.4 0 0 0-5.4 5.4c0 3.6-1.4 4.8-1.4 6h13.6c0-1.2-1.4-2.4-1.4-6A5.4 5.4 0 0 0 12 4.2Z', 'M10.2 18.4a2 2 0 0 0 3.6 0'], note: '通知；notification icon 用單色剪影版' },
  volume: { s: ['M4.6 9.8h2.8l4-3.4v11.2l-4-3.4H4.6Z', 'M15.4 9.4a3.4 3.4 0 0 1 0 5.2', 'M17.8 7.2a6.6 6.6 0 0 1 0 9.6'] },
  musicNote: { s: ['M13.2 16V6.6l4.4-1.2v2.8l-4.4 1.2'], shapes: [{ type: 'circle', cx: 10.4, cy: 16, r: 2.8 }], note: '通用音樂符號（空狀態、預設封面）' },

  // ── Claude Code 補齊(ODE-REBRAND-PLAN Q3):45 個定稿 key 對唔晒現用 43 個
  // MaterialIcons,呢 8 個邊角狀態 icon 冇精確對應,照 24×24/stroke 1.75/round
  // 規格自繪。「XX-off」5 個統一用「基圖 + 對角斜線」做法,風格同一套。 ─────
  wifiOff: {
    s: ['M5 15a10 10 0 0 1 14 0', 'M8 18a5.5 5.5 0 0 1 8 0', 'M4.2 4.2 19.8 19.8'],
    shapes: [{ type: 'circle', cx: 12, cy: 20.4, r: 1.1, fill: true }],
    note: '離線狀態(登入頁/錯誤狀態);基圖 wifi 弧線 + 對角斜線',
  },
  cloudOff: {
    s: [
      'M16.6 16.2a3.6 3.6 0 0 0-.9-7A5 5 0 0 0 6.3 9.6a3.9 3.9 0 0 0 .5 7.7h9.3',
      'M4.2 4.2 19.8 19.8',
    ],
    note: '同步失敗/離線;基圖雲形 + 對角斜線',
  },
  musicOff: {
    s: ['M13.2 16V6.6l4.4-1.2v2.8l-4.4 1.2', 'M4.2 4.2 19.8 19.8'],
    shapes: [{ type: 'circle', cx: 10.4, cy: 16, r: 2.8 }],
    note: '冇歌/清單暫時冇歌;基圖 musicNote + 對角斜線',
  },
  linkOff: {
    s: [
      'M10.4 13.6a3.4 3.4 0 0 0 4.8 0l1.2-1.2',
      'M13.6 10.4a3.4 3.4 0 0 0-4.8 0l-1.2 1.2',
      'M4.2 4.2 19.8 19.8',
    ],
    note: '分享清單已失效(SharedPlaylistSheet gone 狀態);基圖 link + 對角斜線',
  },
  visibilityOff: {
    s: [
      'M3.6 12C5.4 8 8.4 6 12 6C15.6 6 18.6 8 20.4 12C18.6 16 15.6 18 12 18C8.4 18 5.4 16 3.6 12Z',
      'M4.2 4.2 19.8 19.8',
    ],
    shapes: [{ type: 'circle', cx: 12, cy: 12, r: 2.6 }],
    note: '已下架/隱藏狀態;基圖眼形 + 對角斜線',
  },
  lockOutline: {
    s: ['M8.4 10V7.6a3.6 3.6 0 0 1 7.2 0V10'],
    shapes: [
      { type: 'rect', x: 6, y: 10, width: 12, height: 9, rx: 2 },
      { type: 'circle', cx: 12, cy: 14.2, r: 1.1, fill: true },
    ],
    note: '密碼欄位 icon(AuthScreen/PhoneLoginScreen)',
  },
  email: {
    s: ['M4.4 6.2 12 13 19.6 6.2'],
    shapes: [{ type: 'rect', x: 3.6, y: 5.4, width: 16.8, height: 13.2, rx: 2 }],
    note: '電郵欄位 icon(AuthScreen)',
  },
  systemUpdate: {
    s: ['M12 4.4v9.6', 'M8 10.4l4 4 4-4', 'M5 19h14'],
    note: 'OTA 更新提示 banner(App.js updateBanner)',
  },
};

export default ODE_ICONS;
