// Verifies the precompiled fast path actually engages, and that falling back stays correct.
//
// The important one is the DOM hash check: the build hashes a substring it cut out of the
// file, while the browser hashes what the HTML parser exposes as textContent. If those two
// ever disagree the page still works, but it silently compiles in the browser forever and
// the whole optimisation is dead. So we check it in a real DOM.
import fs from 'fs';
import crypto from 'crypto';
import assert from 'assert';
import { JSDOM } from 'jsdom';
import * as Babel from '@babel/standalone';

const html = fs.readFileSync('/home/user/Honeypot0101/index.html', 'utf8');
const built = fs.readFileSync('/home/user/Honeypot0101/app.build.js', 'utf8');
const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '\n        ' + e.message); fail++; }
};

const dom = new JSDOM(html, { runScripts: 'outside-only' });
const el = dom.window.document.getElementById('app-src');

test('the app script is present and stamped with a build hash', () => {
  assert.ok(el, '#app-src not found in the document');
  const stamp = el.getAttribute('data-build-hash');
  assert.ok(stamp && stamp !== '__UNBUILT__', `expected a real hash, got ${stamp}`);
});

test('DOM textContent hashes to the stamped value (the fast path engages)', () => {
  const stamp = el.getAttribute('data-build-hash');
  const actual = sha256(el.textContent);
  assert.strictEqual(actual, stamp,
    'the hash the browser computes does not match the one the build stamped, so the ' +
    'compiled bundle would never be used');
});

test('app.build.js is the exact compile of that source', () => {
  const { code } = Babel.transform(el.textContent, { presets: ['react'] });
  const stripped = built.replace(/^\/\*[\s\S]*?\*\/\n/, '');
  assert.strictEqual(stripped, code, 'app.build.js is not what compiling the source produces');
});

test('app.build.js parses as plain JS with no JSX left in it', () => {
  new Function(built.replace(/^\/\*[\s\S]*?\*\/\n/, '').replace(/^/, 'if(false){') + '\n}');
});

test('the 2.3MB Babel bundle is no longer an unconditional script tag', () => {
  const tags = html.match(/<script src="[^"]*babel[^"]*"><\/script>/g) || [];
  assert.strictEqual(tags.length, 0, `Babel is still loaded unconditionally: ${tags.join(', ')}`);
  assert.ok(html.includes('babel.min.js'), 'the Babel fallback path should still exist');
});

test('editing the JSX by hand without rebuilding falls back instead of running stale code', () => {
  // Simulate a hand edit: same stamp, different source.
  const tampered = html.replace('const taxRate=', 'const taxRate = /* edited */ ');
  const d2 = new JSDOM(tampered, { runScripts: 'outside-only' });
  const e2 = d2.window.document.getElementById('app-src');
  assert.notStrictEqual(sha256(e2.textContent), e2.getAttribute('data-build-hash'),
    'a hand edit must invalidate the stamp so the page recompiles rather than running stale code');
});

test('the loader degrades safely when crypto.subtle is unavailable', () => {
  assert.ok(/!window\.crypto\|\|!crypto\.subtle/.test(html.replace(/\s/g, '')),
    'loader should fall back when crypto.subtle is missing (e.g. some file:// contexts)');
});

test('a missing or blocked app.build.js falls back to compiling in the browser', () => {
  assert.ok(/s\.onerror=loadBabel/.test(html), 'no onerror fallback on the compiled bundle');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
