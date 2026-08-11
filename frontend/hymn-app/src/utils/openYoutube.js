// 開 YouTube App 播指定影片,行唔到就 fallback 去瀏覽器版 youtube.com。
// Android 用 intent:// URL 直接指定 package;iOS 冇 intent scheme,用
// youtube:// custom scheme(要喺 app.json ios.infoPlist.LSApplicationQueriesSchemes
// 宣告 "youtube" 先 query 到 canOpenURL,見 IOS-LAUNCH-PLAN A3)。
import { Linking, Platform } from 'react-native';

export async function openYoutubeVideo(youtubeId) {
  if (!youtubeId) return false;

  const httpsUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const appUrl = Platform.OS === 'ios'
    ? `youtube://watch?v=${youtubeId}`
    : `intent://watch?v=${youtubeId}#Intent;package=com.google.android.youtube;scheme=https;end`;

  try {
    const canOpenApp = await Linking.canOpenURL(appUrl);
    if (canOpenApp) {
      await Linking.openURL(appUrl);
      return true;
    }
    await Linking.openURL(httpsUrl);
    return true;
  } catch (err) {
    console.log('openYoutubeVideo error:', err);
    return false;
  }
}
