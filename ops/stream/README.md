# ops/stream/ — 串流自動修復梯

`STREAM-SELFHEAL-PLAN-20260905.md` 落地(Eric 拍板 Q1(a) 只喺壞咗先自動換 yt-dlp、
Q3 准自動重開 backend)。由 `ops/lyrics/stream-healthcheck.sh`(每 30 分鐘一 tick,
2026-09-05 由 3 小時加密)每次判斷完尾段呼叫,連續 unhealthy≥2 次先郁手,一日內
最多自動換 yt-dlp 1 次、自動重開 backend 2 次,唔會嘗試繞過部署 gate。

| 檔案 | 做乜 |
|---|---|
| `stream-selfheal.sh` | 收 healthcheck 傳嚟嘅七個數(healthy_a/healthy_b/mid/midfail/ok/fail/detail),判形態(①yt-dlp/②backend/③YouTube側)、決定郁唔郁手、寫 `backend/data/stream-selfheal-state.json` + `backend/data/stream-selfheal.log` + `docs/SUPERVISION-LOG.md`。`SELFHEAL_DRY_RUN=1` 全部側效應歸零,淨係印。 |
| `stream-status.sh` | 合併健康檢查 state + selfheal state + 現役 yt-dlp 版本 + backend pid,印一行 JSON,俾 Dispatch 排程 check-in(exit 0=健康/1=唔健康/2=stale,即偵測本身都死咗)。 |

手動查現況(唔會郁任何嘢):

```bash
ops/stream/stream-status.sh
```

要測自動修復梯本身,全部參數(`SELFHEAL_STATE`/`HEALTH_STATE`/`YTDLP_LINK`/
`SELFHEAL_APPLY_CMD`/`SELFHEAL_RESTART_CMD`/`HYMN_STREAM_BASE` 等)都可以 env
override 指去 scratch 目錄,唔會掂 production 檔案 —— 詳細案例見
`STREAM-SELFHEAL-EXEC-20260905.md`。
