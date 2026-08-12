// SwiftAudioEx is fetched from CocoaPods trunk (not vendored in node_modules),
// so patch-package can't reach it — `pod install` re-downloads it fresh every
// `expo prebuild`. This plugin injects a Ruby snippet into the generated
// Podfile's post_install hook that source-patches the pod after it's fetched,
// so the fix survives every prebuild/pod install.
//
// Root cause (see IOS-MIDTRACK-STALL / VPN-throttling retry-storm investigation):
// AVPlayer.automaticallyWaitsToMinimizeStalling's bandwidth estimator repeatedly
// aborts and restarts its buffering plan when per-chunk latency is high and
// jittery (as under VPN throttling), turning a single ~600ms slow response into
// dozens of buffering cycles (~30s). SwiftAudioEx exposes this as a passthrough
// property with no caching, so a playback-failure retry (recreateAVPlayer(),
// which builds a brand new AVPlayer()) silently resets it back to Apple's
// factory default (true) — undoing RNTrackPlayer's one-shot
// setupPlayer({ waitForBuffer: false }) exactly on the failure/retry path.
// This patch caches the value at the wrapper level (default false) and
// re-applies it in setupAVPlayer() so it survives recreateAVPlayer().

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'withSwiftAudioExStallFix';

const OLD_PROPERTY = `    var automaticallyWaitsToMinimizeStalling: Bool {
        get { avPlayer.automaticallyWaitsToMinimizeStalling }
        set { avPlayer.automaticallyWaitsToMinimizeStalling = newValue }
    }`;

const NEW_PROPERTY = `    private var _automaticallyWaitsToMinimizeStalling: Bool = false
    var automaticallyWaitsToMinimizeStalling: Bool {
        get { _automaticallyWaitsToMinimizeStalling }
        set {
            _automaticallyWaitsToMinimizeStalling = newValue
            avPlayer.automaticallyWaitsToMinimizeStalling = newValue
        }
    }`;

const OLD_SETUP = `        // disabled since we're not making use of video playback
        avPlayer.allowsExternalPlayback = false;`;

const NEW_SETUP = `        // disabled since we're not making use of video playback
        avPlayer.allowsExternalPlayback = false;
        avPlayer.automaticallyWaitsToMinimizeStalling = _automaticallyWaitsToMinimizeStalling`;

function rubyPatchSnippet() {
  return `
    # ${MARKER} — see plugins/withSwiftAudioExStallFix.js for the why
    swift_audio_ex_file = File.join(installer.sandbox.pod_dir('SwiftAudioEx'), 'Sources', 'SwiftAudioEx', 'AVPlayerWrapper', 'AVPlayerWrapper.swift')
    if File.exist?(swift_audio_ex_file)
      content = File.read(swift_audio_ex_file)
      unless content.include?('_automaticallyWaitsToMinimizeStalling')
        content = content.sub(
          ${JSON.stringify(OLD_PROPERTY)},
          ${JSON.stringify(NEW_PROPERTY)}
        )
        content = content.sub(
          ${JSON.stringify(OLD_SETUP)},
          ${JSON.stringify(NEW_SETUP)}
        )
        File.write(swift_audio_ex_file, content)
        Pod::UI.puts "[${MARKER}] patched SwiftAudioEx AVPlayerWrapper.swift"
      end
    else
      Pod::UI.warn "[${MARKER}] SwiftAudioEx source not found at #{swift_audio_ex_file}, skipping patch"
    end
`;
}

function withSwiftAudioExStallFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      if (contents.includes(MARKER)) {
        return config;
      }

      const postInstallRegex = /(post_install do \|installer\|\n)([\s\S]*?)(\n(\s*)end\n)/;
      const match = contents.match(postInstallRegex);
      if (!match) {
        throw new Error(
          `[withSwiftAudioExStallFix] Could not find a "post_install do |installer|" block in ${podfilePath} to inject into.`
        );
      }

      const [full, head, body, tailEnd] = match;
      const patched = head + body + rubyPatchSnippet() + tailEnd;
      contents = contents.replace(full, patched);

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
}

module.exports = withSwiftAudioExStallFix;
