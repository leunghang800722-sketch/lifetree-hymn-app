#!/usr/bin/env bash
# 假 apply:記錄被 call;STUB_SWAP=1 就將 $YTDLP_LINK 換去 b slot(模擬真換版),否則 symlink 不變(模擬冇候選)
echo "$(date +%T) stub-swap $*" >> "$STUB_DIR/cmd.calls"
[[ "${STUB_SWAP:-1}" == 1 ]] && ln -sfn ytdlp-venv-b/bin/yt-dlp "$YTDLP_LINK"
echo "stub-swap ran"; exit 0
