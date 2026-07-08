// 封面圖片 Helper - 用 YouTube thumbnail
// 簡單方法，唔使 upload 任何圖

// YouTube thumbnail sizes:
// hqdefault.jpg (480x360) - 最高質
// mqdefault.jpg (320x180)
// default.jpg (120x90)
// maxresdefault.jpg (1280x720) - 有時冇

export function getAlbumCoverUrl(youtubeId) {
  if (!youtubeId) return null;
  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
}
