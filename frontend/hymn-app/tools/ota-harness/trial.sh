#!/bin/zsh
# One harness trial.
#   trial.sh "<label>" embedded   -> pm clear, launch once, play on the APK's own bundle
#   trial.sh "<label>" ota        -> pm clear, launch (embedded, downloads update),
#                                    restart so the downloaded update launches, then play
export PATH=$PATH:$HOME/android-sdk/platform-tools
P=com.hymnapp.praise
LABEL="$1"; MODE="${2:-ota}"

adb shell am force-stop $P >/dev/null
adb shell pm clear $P >/dev/null
adb shell pm grant $P android.permission.POST_NOTIFICATIONS >/dev/null
adb logcat -c; adb logcat -b events -c

adb shell am start -n $P/.MainActivity >/dev/null 2>&1
sleep 35
if [ "$MODE" = "ota" ]; then
  adb shell am force-stop $P >/dev/null
  sleep 3
  adb logcat -c; adb logcat -b events -c
  adb shell am start -n $P/.MainActivity >/dev/null 2>&1
  sleep 28
fi

adb shell input tap 820 1309     # first song's play button on the home screen
sleep 24

N=$(adb shell dumpsys notification --noredact 2>/dev/null | grep -c "pkg=$P")
FG=$(adb shell dumpsys activity services $P 2>/dev/null | grep -c "isForeground=true")
ACT=$(adb shell dumpsys media_session 2>/dev/null | grep -A16 "KotlinAudioPlayer com.hymnapp" | grep -o "actions=[0-9]*" | head -1)
STOP=$(adb shell dumpsys media_session 2>/dev/null | grep -A16 "KotlinAudioPlayer com.hymnapp" | grep -c "mName='stop")
ST=$(adb shell dumpsys media_session 2>/dev/null | grep -A16 "KotlinAudioPlayer com.hymnapp" | grep -o "state=[A-Z_]*([0-9])" | head -1)
CH=$(adb logcat -b events -d | grep -i hymnapp | grep -o "channel=kotlin_audio_player" | head -1)

echo "$LABEL [$MODE] | notif=$N fgSvc=$FG stopAction=$STOP $ST $ACT mediaChannel=${CH:-NONE}"
