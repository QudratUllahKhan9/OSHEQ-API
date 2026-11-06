/**
 * store.js — tiny data layer. Uses MongoDB when MONGO_URI is reachable,
 * otherwise a JSON file (data/db.json) so the API always boots.
 * Documents carry our own `id` (uuid) so both backends behave identically.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

let driver = null;      // mongo driver db
let mode = 'json';

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({}, null, 2));
}
function readAll() { ensureFile(); try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } }
function writeAll(db) { ensureFile(); fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); }

const matches = (doc, q = {}) => Object.entries(q).every(([k, v]) => doc[k] === v);

async function init() {
  const uri = (process.env.MONGO_URI || '').trim();
  if (!uri) { console.log('[store] mode=json (MONGO_URI not set)'); return; }
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    driver = mongoose.connection.db;
    mode = 'mongodb';
    console.log('[store] mode=mongodb');
  } catch (e) {
    mode = 'json';
    console.warn('[store] mongo unavailable (' + e.message.split('\n')[0] + ') -> json fallback');
  }
}

const newId = () => crypto.randomUUID();

async function insert(collection, doc) {
  const row = { id: doc.id || newId(), createdAt: new Date().toISOString(), ...doc };
  if (mode === 'mongodb') { await driver.collection(collection).insertOne({ ...row }); return row; }
  const db = readAll(); (db[collection] = db[collection] || []).push(row); writeAll(db); return row;
}

async function find(collection, query = {}) {
  if (mode === 'mongodb') {
    return driver.collection(collection).find(query, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  }
  return (readAll()[collection] || []).filter(d => matches(d, query)).slice().reverse();
}

async function findOne(collection, query = {}) {
  if (mode === 'mongodb') return driver.collection(collection).findOne(query, { projection: { _id: 0 } });
  return (readAll()[collection] || []).find(d => matches(d, query)) || null;
}

async function update(collection, query, patch) {
  if (mode === 'mongodb') {
    await driver.collection(collection).updateOne(query, { $set: patch });
    return findOne(collection, query);
  }
  const db = readAll();
  const rows = db[collection] || [];
  const i = rows.findIndex(d => matches(d, query));
  if (i === -1) return null;
  rows[i] = { ...rows[i], ...patch };
  writeAll(db);
  return rows[i];
}

async function remove(collection, query) {
  if (mode === 'mongodb') { const r = await driver.collection(collection).deleteOne(query); return r.deletedCount; }
  const db = readAll();
  const rows = db[collection] || [];
  const keep = rows.filter(d => !matches(d, query));
  db[collection] = keep;
  writeAll(db);
  return rows.length - keep.length;
}

module.exports = { init, insert, find, findOne, update, remove, newId, get mode() { return mode; } };
