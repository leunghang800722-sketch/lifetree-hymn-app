// E-1(PERF-STAGE2-2E-20260902)正控 harness server。
//
// 兩條 route:
//   /hang   —— headers 即刻 200,寫一截 body 之後**永遠唔 end()**(模擬
//               PERF-STAGE2-2B-OPUS-20260902.md §2.6 講嘅場景:headers 到
//               咗、body 卡死)。
//   /normal —— 正常、即刻回完整 JSON,確認修法唔影響正常 route。
//
// PORT 用環境變數 E1_PORT,default 3987(避開 3001/3002 呢啲已用緊嘅 port)。
import express from 'express';

const PORT = process.env.E1_PORT || 3987;
const app = express();

app.get('/hang', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write('{"data":[');
  // 故意唔 res.end() —— body 永遠唔完成。
});

app.get('/normal', (req, res) => {
  res.json({ data: [{ id: 1, title: 'ok' }], dataVersion: 'v1' });
});

const server = app.listen(PORT, () => {
  console.log(`e1-harness listening on ${PORT}`);
});

process.on('SIGTERM', () => server.close());
