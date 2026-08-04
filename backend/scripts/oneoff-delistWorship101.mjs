import { delistHymn } from '../lib/adminHymns.js';

const ids = [6256,6257,6258,6259,6260,6261,6295,6296,6297,6298,6299,6300,6399,6400,6401,6402,6403,6480,6481,6482,6483,6484,6485];

(async () => {
  const results = [];
  for (const id of ids) {
    const r = await delistHymn(id);
    results.push({ id, before: r.before, after: r.after, idempotent: !!r.idempotent });
    console.log(`delisted ${id}: before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)} idempotent=${!!r.idempotent}`);
  }
  console.log('DONE', results.length);
  process.exit(0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
