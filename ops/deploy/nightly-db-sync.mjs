#!/usr/bin/env node
// nightly-db-sync.mjs —— 每晚夜間 job 跑完之後,自動將 backend/hymns.db
// commit + push 上 GitHub,唔使人手記住。
//
// 背景:2026-08-25 發現 GitHub 上嘅備份停留咗喺 7-31,成個 8 月(313 個 commit)
// 淨係喺 Eric 部 Mac。推晒之後,個歌庫每晚俾排程 job 改,如果冇人手推就會再次落後。
//
// ── 三重安全網 ─────────────────────────────────────────────────
// ① 等清場:輪住 poll,等 backend/scripts/ 嘅排程 job(backfillMeta/growLibrary/
//    alignBackfill/backfillAlbumSearch/checkDeadLinks)全部收工先郁手。
//    等唔到就照做 —— 因為②本身已經保證個檔唔會爛,最多係「今晚嗰批做咗一半」,
//    聽晚會補返,冇任何資料損失。
// ② DB 鎖:一定要攞到 backend/lib/hymnDb.js 個鎖先影快照,確保唔會撞正
//    saveDb() 寫到一半(見 feedback-hymnsdb-writes-need-lock)。
// ③ staging area 必須乾淨:如果有第二個 session 擺咗嘢喺 staging area,
//    今晚直接唔郁,聽晚再試 —— 寧願遲一日,都唔可以夾走人哋做緊嘅嘢。
//
// ⚠️ 只 commit backend/hymns.db 一個檔。
//    backend/data/suspected-nonsong.md 雖然都係 backfillMeta 寫,但人手複核班
//    都會改佢,自動 commit 會夾走人哋未完成嘅編輯,所以特登唔加。
//
// 用法:node ops/deploy/nightly-db-sync.mjs [--dry-run] [--max-wait-min N]

import { acquireDbLock, releaseDbLock } from '../../backend/lib/hymnDb.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const DB_REL = 'backend/hymns.db';
const DB = path.join(REPO, DB_REL);
const BACKUP_DIR = path.join(REPO, 'backend', 'backups');
const PIDFILE = '/tmp/hymn_dbsync.pid';
const ALERT_FILE = '/tmp/hymn_dbsync-NEEDS-ATTENTION.txt';
const KEEP_BACKUPS = 7;

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const MAX_WAIT_MIN = Number(
  (argv[argv.indexOf('--max-wait-min') + 1] ?? '120').replace(/[^0-9]/g, '') || 120
);
const POLL_SEC = 30;
const CLEAR_POLLS_NEEDED = 2; // 要連續 2 次見到清場先當真係靜

// backend/scripts/ 嘅排程 job —— 呢啲係會長跑兼寫 DB 嘅。
// ops/lyrics/ 嘅複核掃描器**特登唔當佢哋 busy**:嗰啲係 agent 帶住跑,隨時
// 幾個鐘,等佢哋就永遠唔會 commit;而且佢哋寫入照樣行 DB 鎖,②已經 cover。
const BUSY_RE = /hymn-app\/backend\/scripts\//;

const log = (m) => {
  const t = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${t}] ${m}`);
};
const git = (args, opts = {}) =>
  execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', ...opts }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 單一實例保護 ──────────────────────────────────────────────
function claimPidfile() {
  try {
    const old = Number(fs.readFileSync(PIDFILE, 'utf8').trim());
    if (old && old !== process.pid) {
      try {
        process.kill(old, 0);
        log(`⏭  已經有另一個 db-sync (pid ${old}) 跑緊,今次唔做`);
        process.exit(0);
      } catch (_) {
        /* 舊 pid 已死,可以搶 */
      }
    }
  } catch (_) {
    /* 冇 pidfile,正常 */
  }
  fs.writeFileSync(PIDFILE, String(process.pid));
}

function busyJobs() {
  const ps = execFileSync('ps', ['-Ao', 'pid=,command='], { encoding: 'utf8' });
  return ps
    .split('\n')
    .filter((l) => BUSY_RE.test(l))
    .map((l) => l.trim().split(/\s+/).slice(0, 1).concat(l.match(/scripts\/([\w.]+)/)?.[1] ?? '?').join(' '));
}

async function waitForQuiet() {
  const deadline = Date.now() + MAX_WAIT_MIN * 60_000;
  let clear = 0;
  for (;;) {
    const busy = busyJobs();
    if (busy.length === 0) {
      clear++;
      if (clear >= CLEAR_POLLS_NEEDED) return true;
    } else {
      if (clear > 0 || Date.now() % 300_000 < POLL_SEC * 1000) log(`   等緊收工: ${busy.join(', ')}`);
      clear = 0;
    }
    if (Date.now() > deadline) {
      log(`⚠️  等咗 ${MAX_WAIT_MIN} 分鐘仲有 job 跑緊 (${busy.join(', ') || '—'})`);
      log('   照做 —— DB 鎖保證個快照完整,最多係今晚嗰批做咗一半,聽晚補返。');
      return false;
    }
    await sleep(POLL_SEC * 1000);
  }
}

function pruneBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const olds = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('hymns.db.bak-gitsync-'))
    .sort()
    .reverse()
    .slice(KEEP_BACKUPS);
  for (const f of olds) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
    log(`   清走舊 backup: ${f}`);
  }
}

// ── 主流程 ────────────────────────────────────────────────────
claimPidfile();
log('══ nightly-db-sync 開始 ══' + (DRY ? '  (--dry-run,唔會真係 commit/push)' : ''));

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
log(`branch = ${branch}`);

// 望一眼同 GitHub 差幾多。落後 = 上次 push 失敗咗未解決,要嘈醒人。
try {
  git(['fetch', '--quiet', 'origin', branch]);
  const [behind, ahead] = git(['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`]).split(/\s+/);
  log(`同 GitHub 比較:本機行前 ${ahead} 粒 / 落後 ${behind} 粒`);
  if (Number(behind) > 0) {
    log('⚠️  本機落後過 GitHub —— push 一定會俾拒絕,要人手行一次 `git pull --rebase --autostash` 先解得開。');
  }
} catch (e) {
  log(`⚠️  fetch 唔到 origin(${String(e.message).split('\n')[0]}),照做落去,push 嗰陣先知。`);
}

// 防呆③:staging area 一定要乾淨
const staged = git(['diff', '--cached', '--name-only']);
if (staged) {
  log('⛔ staging area 唔乾淨,有第二個 session 擺咗嘢喺度:');
  staged.split('\n').forEach((f) => log(`     ${f}`));
  log('   今晚唔郁,聽晚再試(唔可以夾走人哋做緊嘅嘢)。');
  process.exit(2);
}

// 個 DB 有冇改過?冇就唔使做
if (!git(['status', '--porcelain', '--', DB_REL])) {
  log('✅ hymns.db 冇變動,唔使 commit。收工。');
  process.exit(0);
}

log(`等清場中(最多 ${MAX_WAIT_MIN} 分鐘)…`);
const wasQuiet = await waitForQuiet();
log(wasQuiet ? '✅ 清場,冇 job 跑緊' : '⚠️  唔算完全清場,照落手');

// 防呆②:攞 DB 鎖先影快照
const token = await acquireDbLock('nightly-db-sync', 10 * 60_000);
if (!token) {
  log('⛔ 10 分鐘內攞唔到 DB 鎖,今晚唔做,聽晚再試。');
  process.exit(3);
}
log('✅ 攞到 DB 鎖');

let backupPath;
try {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  backupPath = path.join(BACKUP_DIR, `hymns.db.bak-gitsync-${stamp}`);
  fs.copyFileSync(DB, backupPath);
  const mb = (fs.statSync(backupPath).size / 1048576).toFixed(1);
  log(`✅ backup: ${path.basename(backupPath)} (${mb}MB)`);

  // 驗完整性先入 git —— 個 backup 同快照係鎖入面同一份 bytes
  const chk = execFileSync('sqlite3', [backupPath, 'PRAGMA quick_check;'], { encoding: 'utf8' }).trim();
  if (chk !== 'ok') throw new Error(`quick_check 唔係 ok:${chk}`);
  log('✅ 完整性檢查:ok');

  if (!DRY) {
    git(['add', '--', DB_REL]); // 精確 pathspec,唔用 -A
    log('✅ git add(快照已入 object store)');
  }
} finally {
  releaseDbLock(token);
  log('✅ 已放鎖');
}

pruneBackups();

if (DRY) {
  log('(--dry-run)到此為止,冇 commit 冇 push。');
  process.exit(0);
}

// 再確認一次:index 得返 hymns.db 一個檔
const staged2 = git(['diff', '--cached', '--name-only']);
if (staged2 !== DB_REL) {
  log(`⛔ index 唔止 hymns.db(${staged2.split('\n').join(', ')}),為安全起見唔 commit。`);
  git(['reset', '--', DB_REL]);
  process.exit(4);
}

const songs = execFileSync('sqlite3', [backupPath, 'SELECT COUNT(*) FROM hymns;'], { encoding: 'utf8' }).trim();
const lyr = execFileSync('sqlite3', [backupPath, "SELECT COUNT(*) FROM hymns WHERE lyrics IS NOT NULL AND lyrics<>'';"], { encoding: 'utf8' }).trim();
const today = new Date().toISOString().slice(0, 10);

git([
  'commit',
  '-m',
  `chore(db): 每晚自動備份 hymns.db (${today})\n\n` +
    `歌曲 ${songs} 首 / 已複核歌詞 ${lyr} 首。\n` +
    `由 ops/deploy/nightly-db-sync.mjs 自動產生:攞住 DB 鎖影快照、\n` +
    `PRAGMA quick_check = ok、只 commit ${DB_REL} 一個檔。\n` +
    `本機 backup:backend/backups/${path.basename(backupPath)}`,
]);
log(`✅ commit 完成:${git(['log', '-1', '--format=%h %s'])}`);

try {
  execFileSync('git', ['-C', REPO, 'push', 'origin', branch], { encoding: 'utf8', stdio: 'pipe' });
  log(`✅ push 完成 → origin/${branch}`);
  try { fs.unlinkSync(ALERT_FILE); } catch (_) {}
} catch (e) {
  const detail = String(e.stderr || e.message).trim().split('\n').slice(-3).join(' | ');
  log(`⛔ push 失敗:${detail}`);
  log('   粒 commit 已經喺本機安全留低,唔會自動 force push。');
  log(`   ⚠️ 呢個唔會自己好返 —— 要人手喺 ${REPO} 行一次 \`git pull --rebase --autostash\` 再 push。`);
  fs.writeFileSync(
    ALERT_FILE,
    `nightly-db-sync push 失敗\n時間:${new Date().toISOString()}\nbranch:${branch}\n原因:${detail}\n\n` +
      `解法(--autostash 一定要加,唔係會俾其他 session 未 commit 嘅改動擋住):\n` +
      `  cd ${REPO} && git pull --rebase --autostash && git push origin ${branch}\n` +
      `未解決之前,每晚都會照樣 commit 但推唔上 GitHub。\n`
  );
  log(`   已留低警示檔:${ALERT_FILE}`);
  process.exit(5);
}

log('══ nightly-db-sync 完成 ══');
