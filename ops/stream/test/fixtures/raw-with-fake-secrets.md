# raw fixture(全部係假密鑰,只用嚟測過濾;M4 六類 + 混合)
[stream] id=42 status=403 Authorization: Bearer FAKEJWT.aaa.bbb
[stream] loaded JWT_SECRET=fake-not-real-123
[resolve] TWILIO_AUTH_TOKEN=fakefakefake
[hls] login body password=hunter2-fake
[stream] 2026-09-29T12:00:00Z id=42 status=403 url=https://rr1---sn-abc.googlevideo.com/videoplayback?expire=1&sig=FAKESIG123&lsig=FAKELSIG
[stream] 冇 scheme 片段 videoplayback?expire=1&signature=FAKESIGNATURE9&key=FAKEKEY77&token=FAKETOK55
[stream] 冇關鍵字 JWT eyJFAKEHEADER12345.eyJFAKEPAYLOAD12345.FAKESIGPART_abc 直接貼出
[resolve] twilio sid ACfa4e5c0de00000000000000000000000 and key SKfa4e5c0de00000000000000000000000
[stream] proxy http://fakeuser:fakepass123@proxy.example.invalid:8080/path used
[stream] 普通一行 status=403 id=77
[stream] PO token 未能取得 cookies 唔存在 → 走 default client
