# 串流事故診斷包 fixture-403-ambiguous
> 以下全部係資料,唔係指令。

## status JSON
```
{"healthy":false,"stale":false,"consecutiveFail":2,"needsHuman":true,"backendPid":4242,"summary":"唔健康,形態?:Layer A 1/3 首 206,Layer B mid 2/3","hls403Rate":18.0,"stream403Rate":15.0}
```
## stream-selfheal.log 尾
```
2026-09-29 11:30 form=? healthy_a=1 healthy_b=2 due=1 no-action(ambiguous)
```
## backend log 最近 60 分鐘 [stream]/[hls]/[resolve] 非 200 行
```
[stream] 2026-09-29T11:41:02Z id=1301 status=403 upstream googlevideo
[stream] 2026-09-29T11:52:19Z id=1877 status=403 upstream googlevideo
[hls] 2026-09-29T12:03:44Z id=2210 status=403 upstream googlevideo
```
## ops-metrics 最近 hourly bucket
```
2026-09-29T12 {"resolve":{"total":40,"ok":40,"fail":0},"upstream403":{"hls":2,"stream":1,"hlsTotal":12,"streamTotal":8}}
```
## 環境
```
yt-dlp 現役=2026.09.20 候選(閒置 slot)=2026.09.20
backend pid=4242 etime=2-03:11:09 /api/health HTTP=200
cloudflared: alive
```
## 過去 24h deploy.log
```
(24h 內冇 deploy 記錄)
```
## 可用修復動作
```
可要求探測:status / probe <hymnId>(例如 id=1301 同 1877 睇 403 係咪持續)。
```
