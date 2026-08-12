# SwiftAudioEx 1.1.0 — automaticallyWaitsToMinimizeStalling stall-storm fix

`SwiftAudioEx` is fetched from CocoaPods **trunk** (`Podfile.lock` → `trunk: SwiftAudioEx`),
not vendored under `node_modules`, so `patch-package` cannot target it — there is no
`node_modules/SwiftAudioEx` for it to diff/patch. Instead this fix is applied by
[`../plugins/withSwiftAudioExStallFix.js`](../plugins/withSwiftAudioExStallFix.js), an Expo
config plugin that injects a Ruby snippet into the generated `ios/Podfile`'s `post_install`
hook. The snippet source-patches `Pods/SwiftAudioEx/Sources/SwiftAudioEx/AVPlayerWrapper/AVPlayerWrapper.swift`
right after CocoaPods fetches it, every `pod install` (including inside `expo prebuild` on
EAS Build, since `ios/` itself is gitignored/CNG-generated and never committed). This is the
CocoaPods-native equivalent of what `patch-package` does for `node_modules` packages — same
guarantee (survives the dependency being re-fetched from scratch), different mechanism because
the dependency lives outside `node_modules`.

Verified locally: `rm -rf ios/Pods/SwiftAudioEx && pod install` re-downloads the pod from
trunk and the post_install hook re-patches it (logs
`[withSwiftAudioExStallFix] patched SwiftAudioEx AVPlayerWrapper.swift`); a second
`pod install` is a no-op (idempotent, guarded by checking for `_automaticallyWaitsToMinimizeStalling`
already present in the file).

## What changes and why

`AVPlayerWrapper.swift` originally exposed `automaticallyWaitsToMinimizeStalling` as a pure
passthrough to `AVPlayer`:

```swift
var automaticallyWaitsToMinimizeStalling: Bool {
    get { avPlayer.automaticallyWaitsToMinimizeStalling }
    set { avPlayer.automaticallyWaitsToMinimizeStalling = newValue }
}
```

`react-native-track-player`'s iOS module (`RNTrackPlayer.swift`) sets this once, from
`setupPlayer({ waitForBuffer })`, and `setupPlayer` can only run once per app session
(it rejects with `player_already_initialized` on subsequent calls). But `AVPlayerWrapper`'s
`recreateAVPlayer()` — which runs on every playback-failure retry (`playWhenReady = true`
while `state == .failed`) — builds a **brand new `AVPlayer()`** and calls `setupAVPlayer()`,
which never re-applies this property. Because it was a pure passthrough with no cached value,
every recreate silently reset it back to Apple's factory default (`true`) — precisely on the
failure/retry path where a stall is most likely, undoing whatever the JS layer configured.

`automaticallyWaitsToMinimizeStalling = true` makes `AVPlayer` run its own bandwidth-estimation
heuristic to decide when playback is safe to start/resume. Under a jittery, VPN-throttled
connection (single-request TTFB ~600ms but highly variable), this heuristic repeatedly
invalidates its own estimate and re-enters `.waitingToPlayAtSpecifiedRate` — this is what turns
a single slow response into dozens of buffering cycles (~1.1–1.3s apart) and ~30s of perceived
stall. Android's ExoPlayer has no equivalent adaptive-wait algorithm, so the same VPN jitter
there just delays a single request — it doesn't retrigger a wait/re-estimate loop.

## The patch

1. Cache the value at the wrapper level instead of a pure passthrough, defaulting to `false`:

```swift
private var _automaticallyWaitsToMinimizeStalling: Bool = false
var automaticallyWaitsToMinimizeStalling: Bool {
    get { _automaticallyWaitsToMinimizeStalling }
    set {
        _automaticallyWaitsToMinimizeStalling = newValue
        avPlayer.automaticallyWaitsToMinimizeStalling = newValue
    }
}
```

2. Re-apply the cached value in `setupAVPlayer()`, so it survives `recreateAVPlayer()`:

```swift
private func setupAVPlayer() {
    avPlayer.allowsExternalPlayback = false;
    avPlayer.automaticallyWaitsToMinimizeStalling = _automaticallyWaitsToMinimizeStalling
    ...
```

Paired with the JS-side change in [`../App.js`](../App.js) (`setupPlayer({ waitForBuffer: false })`,
was `true`), this means the "don't second-guess buffering under jitter" setting is applied on
first setup **and stays applied** across every subsequent failure-triggered player recreate.
