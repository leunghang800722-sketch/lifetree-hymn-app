#!/usr/bin/env node
// 印「重做隊仲有幾多首未做」(LYRICS-CJK-OCR-ROOTCAUSE-PLAN §P4)。
// producer-keeper.sh 用:重做隊有貨嗰陣,draft ceiling 唔應該閂住 producer
// (Eric 拍板重做批要優先走完;ceiling 原意係「reviewer 追唔切就唔好堆貨」,
// 但重做批唔係新貨,係 Eric 點名要重出嘅舊貨)。
// 讀 backend/data/lyrics-requeue-priority.json 對返 DB:仲係 status='none' +
// source='cc:miss' 先算 pending(做完嘅 source 會變 ocr/whisper,自然離隊)。
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(__dirname, '..', '..', 'backend');
const PRIORITY = path.join(BACKEND, 'data', 'lyrics-requeue-priority.json');
const DB = path.join(BACKEND, 'hymns.db');

let ids = [];
try { ids = JSON.parse(fs.readFileSync(PRIORITY, 'utf8')).ids || []; } catch (_) {}
if (!ids.length) { console.log('0'); process.exit(0); }

const sql = `SELECT COUNT(*) FROM hymns_all WHERE id IN (${ids.join(',')})
             AND lyrics_status='none' AND lyrics_source='cc:miss'`;
try {
  const { stdout } = await promisify(execFile)('sqlite3', [`file:${DB}?mode=ro`, sql]);
  console.log((stdout || '0').trim() || '0');
} catch (_) {
  console.log('0'); // DB 讀唔到就當 0,keeper 行返正常 ceiling 邏輯(保守)
}
