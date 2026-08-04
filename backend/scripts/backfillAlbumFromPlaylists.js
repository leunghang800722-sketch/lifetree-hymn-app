#!/usr/bin/env node
// backfillAlbumFromPlaylists.js — ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。
// 官方 channel 嘅 YouTube playlist membership 對 DB `youtube_id`——id-level
// exact match,唔使 fuzzy 對歌名(§2 選項A)。兩個 mode:
//
//   --discover --org <name>   列晒官方 channel 嘅 playlists,認邊啲係「專輯
//     playlist」,對每個候選攞 member video id 同 DB 對,出白名單 JSON(等人
//     簽 approved)+ report md。**唔寫 DB**。
//   --apply --org <name>      讀白名單 JSON,**只處理 approved:true** 嘅項,
//     逐 playlist 攞 member,album 為空嘅 row 先寫 `album=<已簽嘅專輯名>,
//     album_source='playlist'`。同一 video 撞多個已簽專輯 = 衝突,唔寫。
//
// 兩個 mode 都支援 --dry(discover 本身已經唔寫 DB;apply --dry 就淨係印會
// 寫咩,唔真係碰 DB)。
//
// ── 保護規則(跟 backfillMeta.js 同一套)──────────────────────────────
//   * 只准填 album 為空嘅 row(ALBUM-BACKFILL-ACCEL-PLAN.md 硬規矩⑤)。
//   * 白名單入面嘅專輯名係人手簽過嘅,唔使過 backfillMeta 嘅 sanitizeAlbum
//     12 字限制,但都要 sanity cap(≤40 字)——寧空莫錯。
//   * 寫 DB 一律經 acquireDbLock/releaseDbLock(硬規矩①),鎖內零網絡操作
//     (apply 寫入嗰刻所有 yt-dlp call 已經做晒)。
//
// Usage:
//   node scripts/backfillAlbumFromPlaylists.js --discover --org 讚美之泉
//   node scripts/backfillAlbumFromPlaylists.js --discover --org 讚美之泉 --dry
//   node scripts/backfillAlbumFromPlaylists.js --apply --org 讚美之泉        # 淨處理白名單 approved:true 嗰批
//   node scripts/backfillAlbumFromPlaylists.js --apply --org 讚美之泉 --dry

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb, saveDb, query, sleep, acquireDbLock, releaseDbLock } from '../lib/hymnDb.js';
import { GROUPS } from '../data/worshipGroups.js';

const execFile = promisify(execFileCb);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const MODE_DISCOVER = process.argv.includes('--discover');
const MODE_APPLY = process.argv.includes('--apply');
const ORG = arg('--org', null);
const DRY = process.argv.includes('--dry');
const DELAY_MS = Number(arg('--delay', 3500));
const DATA_DIR = path.join(__dirname, '..', 'data', 'album-backfill');
const ALBUM_MAX_LEN = 40; // §硬規矩④:白名單 album 名 sanity cap(比 backfillMeta 嘅 12 字寬,因為呢批係人手簽過)

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.9));

function whitelistPath(org) { return path.join(DATA_DIR, `${org}-playlists.json`); }
function discoverReportPath(org) { return path.join(DATA_DIR, `${org}-discover-report.md`); }
function applyReportPath(org) { return path.join(DATA_DIR, `${org}-apply-report.md`); }

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ── org 解析:喺 worshipGroups.js GROUPS 搵 name/aliases 撞得中嘅 entry ──
function findOrgConfig(orgName) {
  return GROUPS.find((g) => g.name === orgName || (g.aliases || []).includes(orgName));
}

// ── yt-dlp -J --flat-playlist:攞一個 URL 嘅 flat JSON(唔逐條 resolve,好平)──
async function fetchFlatJson(url) {
  const { stdout } = await execFile(
    'yt-dlp',
    ['-J', '--flat-playlist', '--skip-download', url],
    { timeout: 90000, maxBuffer: 30 * 1024 * 1024 }
  );
  return JSON.parse(stdout);
}

// ── 分類:呢個 playlist 係咪「疑似專輯」?硬 exclude 規則優先於 include ────
const EXCLUDE_RULES = [
  { re: /全碟|全專輯|合輯|連續播放|精選|best of/i, reason: '合輯/精選(全碟連續播放/最佳精選,唔係單一專輯)' },
  { re: /卡拉ok|karaoke/i, reason: '卡拉OK版' },
  { re: /和聲教室|教學|工作坊/, reason: '教學/工作坊,唔係專輯' },
  { re: /巡迴|聚會|演唱會|音樂會|tour/i, reason: '巡迴/演唱會歌單,唔係專輯' },
  { re: /播放清單|歌單|playlist/i, reason: '主題播放清單(唔係官方編號專輯)' },
  { re: /純音樂|靈修|soaking|舒壓/i, reason: '純音樂/靈修背景音樂(冇編號,非正式專輯)' },
  { re: /特輯|special/i, reason: '特輯(唔係正式編號專輯)' },
];
// 「專輯」單字 or 帶編號嘅「系列(N)」/「(N)系列」——見 §2 選項A 實測嘅穩定命名格式。
// 編號部分容許尾隨一個英文字母(實測讚美之泉「(11J)」「(12P)」「(12A)」呢類
// 分輯子編號)。
const ALBUM_SIGNAL_RE = /專輯|系列\s*[（(]\s*\d+[A-Za-z]?\s*[）)]|[（(]\s*\d+[A-Za-z]?\s*[）)]\s*.{0,4}系列/;

function classifyPlaylist(title) {
  for (const rule of EXCLUDE_RULES) {
    if (rule.re.test(title)) return { included: false, reason: rule.reason };
  }
  if (ALBUM_SIGNAL_RE.test(title)) return { included: true, reason: '「專輯」或編號「系列(N)」訊號' };
  return { included: false, reason: '冇「專輯/系列(N)」訊號,分類唔明,跳過等人手覆核' };
}

// ── 由 playlist title 抽中文專輯名(§2 例:「讚美之泉敬拜讚美專輯 (31) 這是
// 我們的敬拜 This is Our Worship」→「這是我們的敬拜」)。抽唔到就留 null,
// caller fallback 用 playlist title 原文,等人手改。──────────────────────
function extractProposedAlbum(rawTitle, orgName) {
  let title = (rawTitle || '').trim();
  if (!title) return null;

  // 1) 有「｜」/「|」分隔:專輯名同「org+專輯/系列」boilerplate 通常一邊一個
  //    segment,揀唔帶 org+keyword 嗰邊做候選。
  const segments = title.split(/[｜|]/).map((s) => s.trim()).filter(Boolean);
  let target;
  if (segments.length > 1) {
    const candidates = segments.filter((s) => !((orgName && s.includes(orgName)) && /(專輯|系列)/.test(s)));
    if (candidates.length === 1) target = candidates[0];
    else if (candidates.length > 1) target = candidates.sort((a, b) => b.length - a.length)[0];
    else target = segments[0]; // 全部 segment 都帶 keyword,罕見,退返第一段再剝
  } else {
    target = title;
  }

  // 2) 冇靠 pipe 揀走嘅情況(或者揀落嗰段本身仲帶 org+keyword):剝走
  //    「org...keyword(N)」呢段前綴/中綴。⚠️ 實測「讚美之泉安靜系列專輯」
  //    呢類「系列」「專輯」兩個 keyword 黐埋一齊嘅複合命名,淨揀第一個
  //    keyword(「系列」,冇跟編號)會剝漏咗跟手嗰個帶編號嘅「專輯 (N)」。
  //    改做逐個 keyword 掃,優先揀**帶編號**嗰個;成句都冇編號先退返
  //    用最後一個 keyword 做切割點(較貼近真正歌名開始位置)。
  if (orgName && target.includes(orgName) && /(專輯|系列)/.test(target)) {
    const idx = target.indexOf(orgName);
    // ⚠️ 編號部分一定要「數字+可選字母」成組一齊先算(唔可以拆開兩個獨立
    // optional)——試過 `\d*[A-Za-z]?` 呢種寫法,個字母會獨立撞中後面
    // 英文字入面嘅第一個字母(例:冇編號嘅「專輯 Instrumental」會俾字母
    // class 搶走「I」,搞到剝剩「nstrumental」)。
    const kwRe = /(專輯|系列)\s*(?:[（(]\d+[A-Za-z]?[）)])?/g;
    const rest = target.slice(idx);
    let best = null;
    let m;
    while ((m = kwRe.exec(rest)) !== null) {
      best = m;
      if (/\d/.test(m[0])) break; // 帶編號,認定係真正嘅切割點,唔使再掃
    }
    if (best) {
      const cutEnd = idx + best.index + best[0].length;
      target = target.slice(cutEnd);
    }
  }

  // 3) 殘留編號 "(N)"/「（N）」/「(NJ)」清走。
  target = target.replace(/[（(]\s*\d+[A-Za-z]?\s*[）)]/g, ' ').trim();
  // 4) 剝走描述性 filler word 開頭(例:「Instrumental - 每一天我需要祢」
  //    嗰種 —— 「Instrumental」係成個系列嘅類型描述,唔係呢首嘅專輯名)。
  target = target.replace(/^(instrumental|karaoke|acoustic|live|special|tour)\s*[-–:：]?\s*/i, '').trim();
  // 5) 剝走殘留嘅開頭連字號(編號剝走之後成日留低「- 歌名」呢種尾巴)。
  target = target.replace(/^[-－–]\s*/, '').trim();
  target = target.replace(/\s{2,}/g, ' ').trim();
  if (!target) return null;

  // 6) 剝走尾隨純英文譯名(中文名 + 空白 + 全 ASCII 到尾)。
  const m = target.match(/^([^\x00-\x7F][\s\S]*?)\s+[\x00-\x7F]+$/);
  if (m && m[1].trim()) target = m[1].trim();

  if (!target || target.length > ALBUM_MAX_LEN) return null;
  return target;
}

// ── discover mode ────────────────────────────────────────────────────
async function runDiscover() {
  if (!ORG) { console.error('--discover 要帶 --org <name>'); process.exit(1); }
  const cfg = findOrgConfig(ORG);
  if (!cfg) { console.error(`worshipGroups.js 搵唔到 org「${ORG}」`); process.exit(1); }
  if (!cfg.channel) { console.error(`org「${ORG}」冇 channel(worshipGroups.js channel=null),discover mode 用唔到`); process.exit(1); }
  if (cfg.channel.startsWith('playlist?list=')) { console.error(`org「${ORG}」嘅 channel 本身已經係一個 playlist,唔係成個 channel,列唔到「呢個 channel 嘅所有 playlists」`); process.exit(1); }

  log(`discover:org=${ORG} channel=${cfg.channel}`);
  const playlistsUrl = `https://www.youtube.com/${cfg.channel}/playlists`;
  let channelJson;
  try {
    channelJson = await fetchFlatJson(playlistsUrl);
  } catch (e) {
    console.error(`列 channel playlists 失敗:${e?.message || e}`);
    process.exit(1);
  }
  const entries = (channelJson.entries || []).filter((e) => e && e.id);
  log(`channel 共 ${entries.length} 個 playlist`);

  const classified = entries.map((e) => ({ playlist_id: e.id, playlist_title: e.title || '', ...classifyPlaylist(e.title || '') }));
  const included = classified.filter((c) => c.included);
  const excluded = classified.filter((c) => !c.included);
  log(`分類:候選專輯 playlist ${included.length} 個,跳過 ${excluded.length} 個`);

  // DB 全表 youtube_id 索引(唔限 org——同 channel 可能覆蓋子 org,見 brief)。
  const db = await openDb();
  const allRows = query(db, 'SELECT id, youtube_id, album, album_source, org FROM hymns_all');
  const dbByYoutubeId = new Map();
  for (const r of allRows) {
    if (!r.youtube_id) continue;
    if (!dbByYoutubeId.has(r.youtube_id)) dbByYoutubeId.set(r.youtube_id, []);
    dbByYoutubeId.get(r.youtube_id).push(r);
  }

  const candidates = [];
  const videoOwners = new Map(); // youtube_id -> [{ playlist_id, playlist_title, proposed_album }]
  for (let i = 0; i < included.length; i++) {
    const c = included[i];
    log(`  [${i + 1}/${included.length}] 攞 member:${c.playlist_id} 「${c.playlist_title}」`);
    let members = [];
    try {
      const j = await fetchFlatJson(`https://www.youtube.com/playlist?list=${c.playlist_id}`);
      members = (j.entries || []).map((e) => e.id).filter(Boolean);
    } catch (e) {
      log(`    ⚠ 攞 member 失敗:${e?.message || e}`);
    }
    if (i < included.length - 1) await sleep(jitter(DELAY_MS));

    const matchedIds = members.filter((id) => dbByYoutubeId.has(id));
    const proposedAlbum = extractProposedAlbum(c.playlist_title, ORG) || c.playlist_title.trim().slice(0, ALBUM_MAX_LEN);
    for (const id of matchedIds) {
      if (!videoOwners.has(id)) videoOwners.set(id, []);
      videoOwners.get(id).push({ playlist_id: c.playlist_id, playlist_title: c.playlist_title, proposed_album: proposedAlbum });
    }

    candidates.push({
      playlist_id: c.playlist_id,
      playlist_title: c.playlist_title,
      proposed_album: proposedAlbum,
      member_count: members.length,
      matched_in_db: matchedIds.length,
      approved: false,
    });
  }

  // 衝突樣本:同一 video 出現喺多個候選(唔同專輯名)嘅 playlist——留俾 apply
  // 前人手睇,可能係精選輯 vs 原專輯呢類要揀優先次序嘅情況。
  const conflicts = [];
  for (const [videoId, owners] of videoOwners) {
    const distinctAlbums = [...new Set(owners.map((o) => o.proposed_album))];
    if (distinctAlbums.length > 1) conflicts.push({ videoId, owners });
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const wlPath = whitelistPath(ORG);
  if (!DRY) {
    fs.writeFileSync(wlPath, JSON.stringify(candidates, null, 2), 'utf8');
    log(`白名單已寫:${wlPath}`);
  } else {
    log(`--dry:白名單未寫(本應寫去 ${wlPath})`);
  }

  writeDiscoverReport({ org: ORG, channel: cfg.channel, included, excluded, candidates, conflicts, dry: DRY });
}

function writeDiscoverReport({ org, channel, included, excluded, candidates, conflicts, dry }) {
  const lines = [];
  lines.push(`# backfillAlbumFromPlaylists discover 報告 —— org=${org}`);
  lines.push('');
  lines.push(`> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。channel=${channel}。生成時間:${stamp()}${dry ? '(--dry,白名單 JSON 未寫)' : ''}`);
  lines.push('');
  lines.push('## 候選專輯 playlist(白名單,等人手 approved)');
  lines.push('');
  lines.push('| playlist_id | playlist_title | proposed_album | member_count | matched_in_db |');
  lines.push('|---|---|---|---|---|');
  for (const c of candidates) {
    lines.push(`| ${c.playlist_id} | ${mdEscape(c.playlist_title)} | ${mdEscape(c.proposed_album)} | ${c.member_count} | ${c.matched_in_db} |`);
  }
  const totalMatched = candidates.reduce((s, c) => s + c.matched_in_db, 0);
  lines.push('');
  lines.push(`候選 ${candidates.length} 個,合共 matched_in_db ${totalMatched} 首(未去重,同一片可能撞多個候選,見底下衝突段)。`);
  lines.push('');
  lines.push('## 跳過嘅 playlist(非專輯類,連原因)');
  lines.push('');
  lines.push('| playlist_id | playlist_title | 跳過原因 |');
  lines.push('|---|---|---|');
  for (const e of excluded) {
    lines.push(`| ${e.playlist_id} | ${mdEscape(e.playlist_title)} | ${mdEscape(e.reason)} |`);
  }
  lines.push('');
  lines.push('## 衝突樣本(同一 video 撞多個候選專輯,唔同專輯名)');
  lines.push('');
  if (!conflicts.length) {
    lines.push('冇撞到衝突。');
  } else {
    lines.push('| youtube_id | 撞中嘅專輯(playlist_title → proposed_album) |');
    lines.push('|---|---|');
    for (const c of conflicts.slice(0, 30)) {
      const desc = c.owners.map((o) => `「${mdEscape(o.playlist_title)}」→${mdEscape(o.proposed_album)}`).join('; ');
      lines.push(`| ${c.videoId} | ${desc} |`);
    }
    if (conflicts.length > 30) lines.push(`\n(仲有 ${conflicts.length - 30} 條衝突,呢度淨顯示頭 30 條)`);
  }
  lines.push('');
  lines.push('## 下一步');
  lines.push('');
  lines.push('人手/Fable 5 覆核上面「候選專輯 playlist」表,喺對應嘅 JSON 白名單');
  lines.push(`(\`${path.relative(path.join(__dirname, '..', '..'), whitelistPath(org))}\`)入面將簽咗嘅項 \`approved\` 改做 \`true\`,`);
  lines.push('proposed_album 覺得唔啱可以直接改。簽完先可以 `--apply` 真寫 DB。');
  lines.push('');
  fs.writeFileSync(discoverReportPath(org), lines.join('\n'), 'utf8');
  log(`report 已寫:${discoverReportPath(org)}`);
}

// ── apply mode ───────────────────────────────────────────────────────
async function runApply() {
  if (!ORG) { console.error('--apply 要帶 --org <name>'); process.exit(1); }
  const wlPath = whitelistPath(ORG);
  if (!fs.existsSync(wlPath)) { console.error(`搵唔到白名單 ${wlPath},未 discover 過`); process.exit(1); }
  const whitelist = JSON.parse(fs.readFileSync(wlPath, 'utf8'));
  const approved = whitelist.filter((c) => c.approved === true);
  if (!approved.length) { log('白名單入面冇任何一項 approved:true,未簽,收工(冇碰 DB)'); return; }
  log(`apply:org=${ORG},approved ${approved.length}/${whitelist.length} 個候選`);

  // 逐 approved playlist 攞返 fresh member(白名單簽咗之後 playlist 內容可能
  // 變過,唔靠 discover 舊 snapshot)。
  const videoOwners = new Map(); // youtube_id -> [{ playlist_id, playlist_title, proposed_album }]
  let fetchFailCount = 0;
  for (let i = 0; i < approved.length; i++) {
    const c = approved[i];
    const albumName = (c.proposed_album || '').trim();
    if (!albumName || albumName.length > ALBUM_MAX_LEN) {
      log(`  ⚠ ${c.playlist_id}「${c.playlist_title}」proposed_album 唔啱(空或 >${ALBUM_MAX_LEN} 字),skip`);
      continue;
    }
    log(`  [${i + 1}/${approved.length}] 攞 member:${c.playlist_id} 「${c.playlist_title}」→ ${albumName}`);
    let members = [];
    try {
      const j = await fetchFlatJson(`https://www.youtube.com/playlist?list=${c.playlist_id}`);
      members = (j.entries || []).map((e) => e.id).filter(Boolean);
    } catch (e) {
      fetchFailCount++;
      log(`    ⚠ 攞 member 失敗:${e?.message || e}`);
    }
    if (i < approved.length - 1) await sleep(jitter(DELAY_MS));

    for (const id of members) {
      if (!videoOwners.has(id)) videoOwners.set(id, []);
      videoOwners.get(id).push({ playlist_id: c.playlist_id, playlist_title: c.playlist_title, proposed_album: albumName });
    }
  }

  // 衝突:同一 video 撞多個唔同專輯名嘅 approved playlist——唔寫,落 report。
  const conflictRows = [];
  const toWrite = new Map(); // youtube_id -> albumName(冇衝突先入呢度)
  for (const [videoId, owners] of videoOwners) {
    const distinctAlbums = [...new Set(owners.map((o) => o.proposed_album))];
    if (distinctAlbums.length > 1) {
      conflictRows.push({ videoId, owners });
    } else {
      toWrite.set(videoId, distinctAlbums[0]);
    }
  }
  log(`合共 ${videoOwners.size} 個 distinct video id,衝突 ${conflictRows.length} 個(唔寫),可寫候選 ${toWrite.size} 個`);

  // ── 鎖內零網絡操作:全部 yt-dlp call 已經做晒,呢步淨係開 db 逐條 UPDATE ──
  // 2026-08-04 Opus 5 驗收 followup 必修①:淨睇 `row.album` 有冇值唔夠——
  // admin 清空一個寫錯嘅 album 之後(album='' + album_source='manual'),
  // 單靠「album 空就可以寫」guard 會即刻重新填返錯名,令「清空」動作形同
  // 冇做過。加返 album_source IN ('manual','legacy') 一律 skip。
  const writeStats = { written: 0, skippedNonEmpty: 0, skippedProtected: 0, notFound: 0 };
  const writtenSample = [];
  if (!DRY && toWrite.size) {
    const token = await acquireDbLock('backfillAlbumFromPlaylists');
    if (!token) {
      console.error('攞唔到 DB 鎖,收工(下次再試)');
      process.exit(1);
    }
    try {
      const db = await openDb();
      for (const [videoId, albumName] of toWrite) {
        const rows = query(db, 'SELECT id, album, album_source FROM hymns_all WHERE youtube_id = ?', [videoId]);
        if (!rows.length) { writeStats.notFound++; continue; }
        for (const row of rows) {
          if (row.album_source === 'manual' || row.album_source === 'legacy') { writeStats.skippedProtected++; continue; }
          if (row.album && row.album.trim()) { writeStats.skippedNonEmpty++; continue; }
          db.run('UPDATE hymns_all SET album = ?, album_source = ? WHERE id = ?', [albumName, 'playlist', row.id]);
          writeStats.written++;
          if (writtenSample.length < 50) writtenSample.push({ id: row.id, youtube_id: videoId, album: albumName });
        }
      }
      saveDb(db);
    } finally {
      releaseDbLock(token);
    }
  } else {
    // --dry 或者冇嘢寫:淨計數,唔真係開鎖碰 DB。
    const db = await openDb();
    for (const [videoId, albumName] of toWrite) {
      const rows = query(db, 'SELECT id, album, album_source FROM hymns_all WHERE youtube_id = ?', [videoId]);
      if (!rows.length) { writeStats.notFound++; continue; }
      for (const row of rows) {
        if (row.album_source === 'manual' || row.album_source === 'legacy') { writeStats.skippedProtected++; continue; }
        if (row.album && row.album.trim()) { writeStats.skippedNonEmpty++; continue; }
        writeStats.written++;
        if (writtenSample.length < 50) writtenSample.push({ id: row.id, youtube_id: videoId, album: albumName });
      }
    }
  }

  log(`寫入完成:${writeStats.written} 首${DRY ? '(--dry,實際冇寫,以上為模擬計數)' : ''}(album 已非空跳過 ${writeStats.skippedNonEmpty},manual/legacy 保護跳過 ${writeStats.skippedProtected},DB 搵唔到 ${writeStats.notFound},yt-dlp 攞member失敗 ${fetchFailCount} 個 playlist)`);

  writeApplyReport({ org: ORG, approved, conflictRows, writeStats, writtenSample, fetchFailCount, dry: DRY });
}

function writeApplyReport({ org, approved, conflictRows, writeStats, writtenSample, fetchFailCount, dry }) {
  const lines = [];
  lines.push(`# backfillAlbumFromPlaylists apply 報告 —— org=${org}`);
  lines.push('');
  lines.push(`> ALBUM-BACKFILL-ACCEL-PLAN.md Commit 2 / Phase A。生成時間:${stamp()}${dry ? '(--dry,DB 未寫入)' : ''}`);
  lines.push('');
  lines.push(`- approved playlist 數:${approved.length}`);
  lines.push(`- yt-dlp 攞 member 失敗嘅 playlist 數:${fetchFailCount}`);
  lines.push(`- 實際寫入(或 --dry 模擬寫入):${writeStats.written} 首`);
  lines.push(`- album 已非空(保護規則,冇覆寫):${writeStats.skippedNonEmpty} 首`);
  lines.push(`- album_source=manual/legacy(受保護,冇覆寫):${writeStats.skippedProtected} 首`);
  lines.push(`- DB 搵唔到對應 youtube_id:${writeStats.notFound} 首`);
  lines.push(`- 衝突(同一 video 撞多個唔同專輯名,冇寫):${conflictRows.length} 個`);
  lines.push('');
  lines.push('## 寫入樣本(頭 50 條)');
  lines.push('');
  lines.push('| id | youtube_id | album |');
  lines.push('|---|---|---|');
  for (const w of writtenSample) lines.push(`| ${w.id} | ${w.youtube_id} | ${mdEscape(w.album)} |`);
  lines.push('');
  lines.push('## 衝突清單(youtube_id 撞多個唔同專輯名,冇寫)');
  lines.push('');
  if (!conflictRows.length) {
    lines.push('冇衝突。');
  } else {
    lines.push('| youtube_id | 撞中嘅專輯(playlist_title → proposed_album) |');
    lines.push('|---|---|');
    for (const c of conflictRows.slice(0, 30)) {
      const desc = c.owners.map((o) => `「${mdEscape(o.playlist_title)}」→${mdEscape(o.proposed_album)}`).join('; ');
      lines.push(`| ${c.videoId} | ${desc} |`);
    }
  }
  lines.push('');
  fs.writeFileSync(applyReportPath(org), lines.join('\n'), 'utf8');
  log(`report 已寫:${applyReportPath(org)}`);
}

async function main() {
  if (MODE_DISCOVER && MODE_APPLY) { console.error('--discover 同 --apply 唔可以同時用'); process.exit(1); }
  if (MODE_DISCOVER) return runDiscover();
  if (MODE_APPLY) return runApply();
  console.error('要指定 --discover 或者 --apply(兩個都要跟 --org <name>)');
  process.exit(1);
}

main().catch((e) => { console.error('backfillAlbumFromPlaylists 出錯:', e); process.exit(1); });
