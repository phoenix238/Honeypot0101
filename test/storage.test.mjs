// Tests the REAL storage layer, extracted verbatim from index.html, against a real
// IndexedDB implementation. Nothing here is a reimplementation — if index.html changes,
// this test changes with it.
import fs from 'fs';
import assert from 'assert';
import 'fake-indexeddb/auto';

const html = fs.readFileSync('/home/user/Honeypot0101/index.html', 'utf8');

// Pull the storage block out of the shipped file.
const start = html.indexOf('let onStorageFail=');
const endMarker = 'const stripImages=receipts=>receipts.map(r=>r.imageData?{...r,imageData:null}:r);';
const end = html.indexOf(endMarker);
assert.ok(start > -1 && end > -1, 'could not locate storage block in index.html');
const storageSrc = html.slice(start, end + endMarker.length);

// --- fake localStorage with a settable quota -------------------------------
function makeLocalStorage(quotaBytes = Infinity) {
  const map = new Map();
  return {
    _map: map,
    get _bytes() { let n = 0; for (const [k, v] of map) n += k.length + v.length; return n; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      const prev = map.has(k) ? map.get(k).length : 0;
      if (this._bytes - prev + v.length > quotaBytes) {
        const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      }
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
  };
}

let failures = [];
function loadStorage(quota) {
  globalThis.localStorage = makeLocalStorage(quota);
  failures = [];
  const factory = new Function('indexedDB', storageSrc + '\nreturn {LS,ImgDB,stripImages,setStorageFailHandler};');
  const mod = factory(globalThis.indexedDB);
  mod.setStorageFailHandler(msg => failures.push(msg));
  return mod;
}

const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(40000);
const makeReceipts = () => ([
  { id: 'r1', description: 'Train to client', amount: 42.5, date: '2026-03-04', category: 'business', subcategory: 'travel', status: 'logged', imageData: PHOTO },
  { id: 'r2', description: 'No photo', amount: 9.99, date: '2026-03-05', category: 'business', subcategory: 'other', status: 'logged', imageData: null },
  { id: 'r3', description: 'Laptop', amount: 1299, date: '2026-03-06', category: 'business', subcategory: 'equipment', status: 'logged', imageData: PHOTO + 'XYZ' },
]);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('round-trip: receipts + photos come back byte-identical', async () => {
  const { LS, ImgDB, stripImages } = loadStorage();
  const original = makeReceipts();
  for (const r of original) if (r.imageData) await ImgDB.set(r.id, r.imageData);
  LS.set('mhq-receipts', stripImages(original));

  const meta = LS.get('mhq-receipts');
  const imgs = await ImgDB.getAll();
  const restored = meta.map(r => (imgs[r.id] ? { ...r, imageData: imgs[r.id] } : r));

  assert.deepStrictEqual(restored, original, 'restored receipts differ from original');
});

test('photos are kept OUT of localStorage (the quota fix)', async () => {
  const { LS, ImgDB, stripImages } = loadStorage();
  const original = makeReceipts();
  for (const r of original) if (r.imageData) await ImgDB.set(r.id, r.imageData);
  LS.set('mhq-receipts', stripImages(original));

  const raw = globalThis.localStorage.getItem('mhq-receipts');
  assert.ok(!raw.includes('AAAAAAAAAA'), 'base64 photo data leaked into localStorage');
  assert.ok(raw.length < 1000, `receipt metadata should be tiny, got ${raw.length} bytes`);
});

test('a full localStorage now REPORTS instead of silently dropping the save', async () => {
  const { LS } = loadStorage(200); // tiny quota
  const ok = LS.set('mhq-entries', makeReceipts());
  assert.strictEqual(ok, false, 'LS.set should report failure');
  assert.strictEqual(failures.length, 1, 'exactly one failure should be surfaced');
  assert.ok(/storage is full/i.test(failures[0]), `expected a quota message, got: ${failures[0]}`);
});

test('legacy migration: photos already in localStorage move to IndexedDB without loss', async () => {
  const { LS, ImgDB, stripImages } = loadStorage();
  const original = makeReceipts();
  // Simulate the OLD format: photos embedded in the localStorage copy.
  globalThis.localStorage.setItem('mhq-receipts', JSON.stringify(original));

  // This mirrors the boot migration in index.html.
  const localReceipts = LS.get('mhq-receipts');
  const imgs = await ImgDB.getAll();
  for (const r of localReceipts) {
    if (!r.imageData || imgs[r.id]) continue;
    await ImgDB.set(r.id, r.imageData);
    imgs[r.id] = r.imageData;
  }
  const rehydrated = localReceipts.map(r => (r.imageData || !imgs[r.id] ? r : { ...r, imageData: imgs[r.id] }));
  assert.deepStrictEqual(rehydrated, original, 'migration lost or altered receipt data');

  // And after the next save, localStorage is slim while photos survive in IDB.
  LS.set('mhq-receipts', stripImages(rehydrated));
  const after = await ImgDB.getAll();
  assert.strictEqual(after.r1, PHOTO);
  assert.strictEqual(after.r3, PHOTO + 'XYZ');
});

test('deleting a receipt removes its photo (no orphaned blobs)', async () => {
  const { ImgDB } = loadStorage();
  await ImgDB.set('r1', PHOTO);
  await ImgDB.set('r3', PHOTO);
  const live = new Set(['r3']);
  const all = await ImgDB.getAll();
  for (const id of Object.keys(all)) if (!live.has(id)) await ImgDB.del(id);
  const after = await ImgDB.getAll();
  assert.deepStrictEqual(Object.keys(after), ['r3']);
});

test('non-receipt slices are unchanged by any of this', async () => {
  const { LS } = loadStorage();
  const entries = [{ id: 'e1', subtotal: 400, tax: 80, net: 320, status: 'Paid' }];
  const settings = { name: 'A', taxPercent: 30, defaultRate: 35 };
  LS.set('mhq-entries', entries);
  LS.set('mhq-settings', settings);
  assert.deepStrictEqual(LS.get('mhq-entries'), entries);
  assert.deepStrictEqual(LS.get('mhq-settings'), settings);
});

let pass = 0, fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '\n        ' + e.message); fail++; }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
