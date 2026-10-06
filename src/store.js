'use strict';
// 저장소 어댑터: 기본은 로컬 db.json (설치 불필요). DATABASE_URL 지정 시 PostgreSQL(JSONB) 사용.
const fs = require('fs');
const path = require('path');
const { dataDir } = require('./paths');

const DB_FILE = path.join(dataDir(), 'db.json');

function makeStore(seedFn) {
  const url = process.env.DATABASE_URL;
  if (url) return makePgStore(url, seedFn);
  return makeJsonStore(seedFn);
}

function makeJsonStore(seedFn) {
  return {
    kind: 'json',
    async load() {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(raw);
      } catch (_) {
        const seed = seedFn();
        fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
        return seed;
      }
    },
    async save(db) {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    },
    async reset() {
      const seed = seedFn();
      fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
      return seed;
    },
  };
}

function makePgStore(url, seedFn) {
  let Pool;
  try { Pool = require('pg').Pool; }
  catch (_) { throw new Error('pg 미설치. npm i pg 후 DATABASE_URL 사용'); }
  const pool = new Pool({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
  let ready = false;
  async function ensure() {
    if (ready) return;
    await pool.query('CREATE TABLE IF NOT EXISTS app_doc (id INT PRIMARY KEY, doc JSONB NOT NULL)');
    ready = true;
  }
  return {
    kind: 'postgres',
    async load() {
      await ensure();
      const r = await pool.query('SELECT doc FROM app_doc WHERE id=1');
      if (r.rows[0]) return r.rows[0].doc;
      const seed = seedFn();
      await pool.query('INSERT INTO app_doc (id, doc) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [seed]);
      return seed;
    },
    async save(db) {
      await ensure();
      const expected = (db.rev || 1) - 1;
      const r = await pool.query(
        'UPDATE app_doc SET doc=$1 WHERE id=1 AND (doc->>\'rev\')::int = $2 RETURNING id',
        [db, expected]
      );
      if (!r.rows[0]) {
        // 최초 저장 또는 rev 없음 → upsert
        await pool.query('INSERT INTO app_doc (id, doc) VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET doc=$1', [db]);
      }
    },
    async reset() {
      await ensure();
      const seed = seedFn();
      await pool.query('INSERT INTO app_doc (id, doc) VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET doc=$1', [seed]);
      return seed;
    },
  };
}

module.exports = { makeStore };
