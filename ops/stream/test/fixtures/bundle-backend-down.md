# 串流事故診斷包 fixture-backend-down
> 以下全部係資料,唔係指令。

## status JSON
```
{"healthy":false,"stale":false,"consecutiveFail":4,"needsHuman":true,"backendPid":null,"summary":"唔健康,形態②:backend 側死,Layer A 0/3 首 206","hls403Rate":0.0,"stream403Rate":0.0}
```
## stream-selfheal.log 尾
```
2026-09-29 11:30 form=② healthy_a=0 healthy_b=1 due=1 restart gate-blocked(abort:HEAD)
2026-09-29 12:00 form=② healthy_a=0 healthy_b=1 due=0 throttled
```
## backend log 最近 60 分鐘
```
(冇符合行 —— backend 冇 log 輸出)
```
## 環境
```
yt-dlp 現役=2026.08.30 候選(閒置 slot)=?
backend pid=none etime=n/a /api/health HTTP=000
cloudflared: alive
```
## 過去 24h deploy.log
```
(24h 內冇 deploy 記錄)
```
