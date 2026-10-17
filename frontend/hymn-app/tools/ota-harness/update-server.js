// Minimal expo-updates (protocol v1) server for local diagnosis.
// Serves an `expo export` output directory as an OTA update over http://10.0.2.2:4747.
//
// Usage: SERVE_DIR=/path/to/export node update-server.js
// Switch which export is served by writing the dir path into ./ACTIVE_DIR and restarting,
// or by hitting /_set?dir=<abs path> (no restart needed).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 4747;
const HOST_FOR_DEVICE = '10.0.2.2';
let serveDir = process.env.SERVE_DIR;

const sha256b64url = (buf) =>
  crypto.createHash('sha256').update(buf).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

const CONTENT_TYPES = { png: 'image/png', ttf: 'font/ttf', jpg: 'image/jpeg', json: 'application/json' };

function buildManifest() {
  const meta = JSON.parse(fs.readFileSync(path.join(serveDir, 'metadata.json'), 'utf8'));
  const android = meta.fileMetadata.android;

  const bundlePath = path.join(serveDir, android.bundle);
  const bundleBuf = fs.readFileSync(bundlePath);

  const assets = android.assets.map((a) => {
    const rel = a.path;
    const buf = fs.readFileSync(path.join(serveDir, rel));
    return {
      hash: sha256b64url(buf),
      key: path.basename(rel),          // export names asset files by their md5
      contentType: CONTENT_TYPES[a.ext] || 'application/octet-stream',
      fileExtension: `.${a.ext}`,        // expo serves this WITH the leading dot
      url: `http://${HOST_FOR_DEVICE}:${PORT}/asset?p=${encodeURIComponent(rel)}`,
    };
  });

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    runtimeVersion: '2',
    launchAsset: {
      hash: sha256b64url(bundleBuf),
      key: md5(bundleBuf),
      contentType: 'application/javascript',
      url: `http://${HOST_FOR_DEVICE}:${PORT}/asset?p=${encodeURIComponent(android.bundle)}`,
    },
    assets,
    metadata: {},
    extra: {},
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

  if (url.pathname === '/_set') {
    serveDir = url.searchParams.get('dir');
    log('serveDir ->', serveDir);
    res.writeHead(200).end(`serving ${serveDir}\n`);
    return;
  }

  if (url.pathname === '/manifest') {
    log('manifest request', JSON.stringify({
      rt: req.headers['expo-runtime-version'],
      platform: req.headers['expo-platform'],
      current: req.headers['expo-current-update-id'],
    }));
    let manifest;
    try {
      manifest = buildManifest();
    } catch (e) {
      log('manifest build FAILED', e.message);
      res.writeHead(500).end(e.message);
      return;
    }
    const boundary = 'expo-diag-boundary';
    const part =
      `--${boundary}\r\n` +
      `content-type: application/json\r\n` +
      `content-disposition: form-data; name="manifest"\r\n\r\n` +
      `${JSON.stringify(manifest)}\r\n` +
      `--${boundary}--\r\n`;
    res.writeHead(200, {
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',
      'cache-control': 'private, max-age=0',
      'content-type': `multipart/mixed; boundary=${boundary}`,
    });
    res.end(part);
    log('served update', manifest.id, `${manifest.assets.length} assets`);
    return;
  }

  if (url.pathname === '/asset') {
    const rel = url.searchParams.get('p');
    const file = path.join(serveDir, rel);
    if (!fs.existsSync(file)) {
      log('asset MISSING', rel);
      res.writeHead(404).end();
      return;
    }
    log('asset ->', rel);
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, '0.0.0.0', () => console.log(`update server on :${PORT}, serving ${serveDir}`));
