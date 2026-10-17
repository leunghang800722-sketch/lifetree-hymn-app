#!/usr/bin/env node
// 純音樂 MORE-SOURCES / N4 簽白名單 —— PLAN §5 N4 + §6 R2
//
// P4(Eric 2026-08-24 拍板):白名單由我哋(Claude session)簽,Eric 事後抽驗。
// 呢個 script 做嘅係「簽之前嘅硬功課」:改良版 dedup + 出簽名報告。**唔寫 DB。**
//
// 🔴 §6 R2「同曲異 id」—— 呢條路最實在嘅新風險,實測踩過兩次:
//   第一版 dedup(org + normalize 歌名)**完全失效**:normalize 會剝走
//   `【…】` 入面嘅內容,而讚美之泉啲片個歌名**就係喺【】入面**
//   (「【復興聖潔 Revive Holiness】- 讚美之泉鋼琴演奏系列 (1) by 游智婷」),
//   剝完淨返「讚美之泉鋼琴演奏系列by游智婷」—— 12 首 T8 已經入咗庫嘅歌
//   全部照樣顯示「過預篩」,即係會雙收。
//   第二版(CJK 包含比對)**又過寬**:器樂版撞返同名嘅**人聲原版**
//   (「更新我心 (Guitar Version)」撞「《更新我心》現場版 Live Worship」),
//   257 首入面誤殺 216 首 —— 但器樂版 vs 人聲原版係兩個唔同錄音,正正係
//   我哋想收嘅嘢。
//   第三版(而家用緊):CJK 包含比對 **+ 只同 `instrumental=1` 嘅行比**。
//   器樂只同器樂撞先算重複,人聲原版唔阻住器樂版入庫。
// ⚠️ 純拉丁歌名(冇 CJK)唔准自動判重複 —— DB 啲 title 會夾住**專輯名**,
//   實測「Come Away With Me」(歌)撞到「【寶貴十架】- 安靜系列 (1) Come Away
//   With Me」(專輯名)。呢批落 `dup_suspect` 人手裁,唔自動收亦唔自動剔。
//
// 用法:node scripts/signInstrumentalReleases.mjs --org <name> [--sign]
//       (唔加 --sign = dry,淨係出報告)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, query } from '../lib/hymnDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'instrumental');
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ORG = arg('--org', null);
const ALL = process.argv.includes('--all');
const DO_SIGN = process.argv.includes('--sign');
const SIGNER = 'Claude Opus 5 (MORE-SOURCES N4, P4 拍板由我哋簽 / Eric 事後抽驗)';

const log = (...a) => console.log(...a);
const cjk = (s) => String(s || '').replace(/[^一-鿿㐀-䶿]/g, '');
const lat = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const db = await openDb();
const rows = query(db, 'SELECT id, youtube_id, title, org, artist, instrumental FROM hymns_all');
const byOrg = new Map();
for (const r of rows) {
  const o = r.org || r.artist || '';
  if (!byOrg.has(o)) byOrg.set(o, []);
  byOrg.get(o).push({ ...r, c: cjk(r.title), l: lat(r.title) });
}
const allIds = new Set(rows.map((r) => r.youtube_id).filter(Boolean));

// 只同 instrumental=1 嘅行比 CJK 包含
function findInstrumentalDup(org, title) {
  const c = cjk(title);
  if (c.length < 3) return null;
  for (const r of (byOrg.get(org) || [])) {
    if (r.instrumental !== 1) continue;
    if (r.c.length < 3) continue;
    if (r.c.includes(c) || c.includes(r.c)) return r;
  }
  return null;
}
// 純拉丁歌名 → 疑似,唔自動判
function findLatinSuspect(org, title) {
  if (cjk(title).length) return null;
  const l = lat(title);
  if (l.length < 8) return null;
  for (const r of (byOrg.get(org) || [])) {
    // ⚠️ 一定要驗埋 `r.l.length` —— 空字串會令 `l.includes('')` 永遠 true,
    //    實測「Come Away With Me」就係咁撞到「這一生最美的祝福」(冇拉丁字)。
    if (r.l.length < 8) continue;
    if (r.l.includes(l) || l.includes(r.l)) return r;
  }
  return null;
}

const orgs = ALL
  ? fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('-releases.json')).map((f) => f.replace('-releases.json', ''))
  : (ORG ? [ORG] : null);
if (!orgs) { console.error('要帶 --org <name> 或 --all'); process.exit(1); }

const L = ['# 純音樂 MORE-SOURCES / N4 簽白名單報告', '',
  `產生時間:${new Date().toISOString()}`,
  `模式:${DO_SIGN ? '**已簽落 JSON**' : 'dry(淨係報告,未簽)'}`, '',
  '> P4:白名單由 Claude 簽、Eric 事後抽驗。呢個 run **冇寫過 DB**。', ''];
let gNew = 0, gDup = 0, gSus = 0;

for (const org of orgs) {
  const f = path.join(DATA_DIR, `${org}-releases.json`);
  if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!j.length) continue;
  L.push(`## ${org}`, '', '| 專輯 | iTunes | member | 淨新增 | 已有器樂版 | 疑似(人手裁) |', '|---|---|---|---|---|---|');
  for (const rel of j) {
    let n = 0, d = 0, s = 0;
    for (const m of rel.members) {
      m.dup_of = null; m.dup_suspect = null;
      if (allIds.has(m.youtube_id)) { m.dup_of = 'same-youtube-id'; }
      if (!m.pass_pre) continue;
      const dup = findInstrumentalDup(org, m.title);
      if (dup) { m.dup_of = `#${dup.id}`; m.pass_pre = false; m.reasons.push(`org 內已有同名器樂版 #${dup.id}`); d++; continue; }
      const sus = findLatinSuspect(org, m.title);
      if (sus) { m.dup_suspect = `#${sus.id} ${String(sus.title).slice(0, 50)}`; s++; }
      n++;
    }
    gNew += n; gDup += d; gSus += s;
    // 簽名:專輯級證據齊(iTunes 對到數 或 專輯名自身器樂訊號)+ 有淨新增先簽
    if (DO_SIGN) {
      rel.approved = n > 0;
      rel.instrumental_signal = rel.album_signal || (rel.itunes_album ? `iTunes 器樂專輯「${rel.itunes_album}」` : null);
      rel.proposed_album = rel.itunes_album || rel.release_title || null;
      rel.signed_by = rel.approved ? SIGNER : null;
      rel.signed_at = rel.approved ? new Date().toISOString() : null;
      rel.sign_note = rel.approved
        ? `iTunes artistName exact-match 專輯「${rel.itunes_album || '(靠專輯名訊號)'}」${rel.itunes_track_count ? `${rel.itunes_track_count} 首` : ''};OLAK member ${rel.member_count} 首;淨新增 ${n} 首(扣咗 ${d} 首 org 內已有器樂版)`
        : null;
    }
    L.push(`| ${String(rel.release_title).replace(/\|/g, '\\|')} | ${rel.itunes_album ? `${String(rel.itunes_album).replace(/\|/g, '\\|')}(${rel.itunes_track_count}) ` : '—'} | ${rel.member_count} | **${n}** | ${d} | ${s} |`);
  }
  L.push('');
  // 疑似清單
  const sus = j.flatMap((r) => r.members.filter((m) => m.dup_suspect).map((m) => ({ rel: r.release_title, ...m })));
  if (sus.length) {
    L.push('### ⚠️ 純拉丁歌名疑似撞已有行(人手裁,唔自動剔)', '');
    sus.forEach((m) => L.push(`- \`${m.youtube_id}\` **${m.title}** ← 疑似 ${m.dup_suspect}`));
    L.push('');
  }
  if (DO_SIGN) fs.writeFileSync(f, JSON.stringify(j, null, 2), 'utf8');
}
L.push('---', '', `**合計:淨新增 ${gNew} 首 · org 內已有器樂版 ${gDup} 首 · 疑似待裁 ${gSus} 首**`, '');
const out = path.join(DATA_DIR, `sign-report-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md`);
fs.writeFileSync(out, L.join('\n'), 'utf8');
log(`淨新增 ${gNew} · 已有器樂版 ${gDup} · 疑似 ${gSus}`);
log(`report:${out}`);
