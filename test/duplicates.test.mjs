// Proves the grouped duplicate finder in index.html flags exactly the same records as the
// original pairwise scan it replaced. The new implementation is extracted from the shipped
// file; the old one is inlined here as the reference. Randomised over many shapes.
import fs from 'fs';
import assert from 'assert';

const html = fs.readFileSync('/home/user/Honeypot0101/index.html', 'utf8');

const start = html.indexOf('const datesClose=');
const marker = '  return flagged;\n};';
const end = html.indexOf(marker, start);
assert.ok(start > -1 && end > -1, 'could not locate findDuplicates in index.html');
const src = html.slice(start, end + marker.length);

const { findDuplicates, datesClose } = new Function(src + '\nreturn {findDuplicates,datesClose};')();

// The original O(n^2) implementation, verbatim in behaviour.
function originalEntries(activeE) {
  const dup = new Set();
  activeE.forEach((e, i) => {
    for (let j = i + 1; j < activeE.length; j++) {
      const f = activeE[j];
      if (Math.abs((e.subtotal || 0) - (f.subtotal || 0)) < 0.02 &&
          datesClose(e.date, f.date) &&
          (e.client || '').toLowerCase().trim() === (f.client || '').toLowerCase().trim()) {
        dup.add(e.id); dup.add(f.id);
      }
    }
  });
  return dup;
}
function originalReceipts(liveR) {
  const dup = new Set();
  liveR.forEach((e, i) => {
    for (let j = i + 1; j < liveR.length; j++) {
      const f = liveR[j];
      if (Math.abs((e.amount || 0) - (f.amount || 0)) < 0.02 &&
          datesClose(e.date, f.date) &&
          (e.description || '').toLowerCase().trim() === (f.description || '').toLowerCase().trim()) {
        dup.add(e.id); dup.add(f.id);
      }
    }
  });
  return dup;
}

// Deterministic PRNG so a failure is reproducible.
let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const CLIENTS = ['Sarah', 'sarah', ' Sarah ', 'Acme Ltd', 'acme ltd', '', null, 'Bob'];
const AMOUNTS = [100, 100.01, 100.019, 100.02, 100.05, 250, 250.0, 0, null];
const DATES = ['2026-03-01', '2026-03-04', '2026-03-06', '2026-03-07', '2026-03-20', '2026-04-01', '', null];

function makeEntries(n) {
  return [...Array(n)].map((_, i) => ({
    id: 'e' + i, client: pick(CLIENTS), subtotal: pick(AMOUNTS), date: pick(DATES), status: 'Paid',
  }));
}
function makeReceipts(n) {
  return [...Array(n)].map((_, i) => ({
    id: 'r' + i, description: pick(CLIENTS), amount: pick(AMOUNTS), date: pick(DATES), status: 'logged',
  }));
}

const sorted = s => [...s].sort();
let pass = 0, fail = 0;

for (let round = 0; round < 300; round++) {
  const n = 2 + Math.floor(rnd() * 60);
  const entries = makeEntries(n);
  const receipts = makeReceipts(n);

  const gotE = findDuplicates(entries, e => e.client, e => e.subtotal);
  const wantE = originalEntries(entries);
  const gotR = findDuplicates(receipts, r => r.description, r => r.amount);
  const wantR = originalReceipts(receipts);

  try {
    assert.deepStrictEqual(sorted(gotE), sorted(wantE));
    assert.deepStrictEqual(sorted(gotR), sorted(wantR));
    pass++;
  } catch (e) {
    fail++;
    if (fail === 1) {
      console.log(`  FAIL on round ${round} (n=${n})`);
      console.log('    entries got :', sorted(gotE).join(','));
      console.log('    entries want:', sorted(wantE).join(','));
    }
  }
}

// The grouped version must not reorder the caller's array — the setup list renders from it.
const entries = makeEntries(30);
const before = entries.map(e => e.id).join(',');
findDuplicates(entries, e => e.client, e => e.subtotal);
assert.strictEqual(entries.map(e => e.id).join(','), before, 'findDuplicates reordered its input');
console.log('  PASS  input array is not mutated');

console.log(`\n${pass} randomised rounds matched the original exactly, ${fail} failed`);
process.exit(fail ? 1 : 0);
