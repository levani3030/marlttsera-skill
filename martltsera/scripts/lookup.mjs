#!/usr/bin/env node
// martltsera lookup — სიტყვის მართლწერის ძიება.
// ეძებს: (1) data/wordlist.tsv — ნორმით უარყოფილი ფორმები და მათი სწორი შესატყვისები;
//        (2) data/compounds.txt — „კომპოზიტთა მცირე ლექსიკონი“ (ნორმები – კომპოზიცია, 2025);
//        (3) data/index_1986.txt — 1986 წლის ნორმების ორთოგრაფიული საძიებელი.
// ძიებისას დეფისი და ჰარი იგნორირდება, ამიტომ „ვებ-გვერდი“, „ვებ გვერდი“ და „ვებგვერდი“ ერთსა და იმავეს პოულობს.
//
// გამოყენება: node lookup.mjs <სიტყვა> [<სიტყვა>...]      (--max=N — შედეგების ზღვარი თითო წყაროზე, ნაგულისხმევად 8)

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const norm = (s) => s.replace(/[\s\-‐‑–—­]/g, '');
const read = (f) => (existsSync(join(DATA, f)) ? readFileSync(join(DATA, f), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')) : []);

const args = process.argv.slice(2);
let max = 8;
const words = [];
for (const a of args) {
  if (a.startsWith('--max=')) max = Number(a.slice(6)) || max;
  else words.push(a);
}
if (!words.length) {
  console.error('გამოყენება: node lookup.mjs <სიტყვა> [<სიტყვა>...] [--max=N]');
  process.exit(2);
}

const lex = read('wordlist.tsv').map((l) => l.split('\t'));
const compounds = read('compounds.txt');
const index86 = read('index_1986.txt');

// ქართული ბრუნვის ნიშნებისა და თანდებულების მოცილება, რომ „ვებგვერდზე“ → „ვებგვერდ“ მოიძებნოს.
const SUFFIX = /(ებისთვის|ებისგან|ებთან|ებიდან|ებამდე|ებზე|ებში|ების|ებით|ებად|ებმა|ებს|ები|ისთვის|ისგან|იდან|ამდე|თან|ზე|ში|ის|ით|ად|მა|ს|ი|მ|დ)$/;
const keysOf = (w) => {
  const n = norm(w);
  const out = new Set([n]);
  const s = n.replace(SUFFIX, '');
  if (s.length >= 3) out.add(s);
  return [...out];
};

// სტრიქონები, სადაც გასაღები გვხვდება: ჯერ ისინი, რომლებიც გასაღებით იწყება.
const search = (lines, keys) => {
  const head = [], inside = [];
  for (const line of lines) {
    const n = norm(line);
    const k = keys.find((x) => n.includes(x));
    if (!k) continue;
    (n.startsWith(k) ? head : inside).push(line);
  }
  return [...head, ...inside];
};

let found = false;
for (const w of words) {
  console.log(`\n=== ${w} ===`);
  const keys = keysOf(w);

  const bad = lex.filter(([kind, pattern]) => kind !== 're' && pattern && keys.some((k) => (kind === 'stem' ? k.startsWith(norm(pattern)) : k === norm(pattern))));
  for (const [, pattern, suggestion, level, note] of bad.slice(0, max)) console.log(`✗ ${pattern} → ${suggestion}  [${level}] ${note || ''}`);

  const c = search(compounds, keys);
  for (const line of c.slice(0, max)) console.log(`• ${line}`);
  if (c.length > max) console.log(`  … კიდევ ${c.length - max} (გაზარდე --max ან დააზუსტე სიტყვა)`);

  const o = search(index86, keys);
  for (const line of o.slice(0, max)) console.log(`◦ [1986] ${line}`);
  if (o.length > max) console.log(`  … კიდევ ${o.length - max} (1986)`);

  if (bad.length || c.length || o.length) found = true;
  else console.log('ვერ ვიპოვე. რთული სიტყვისთვის გამოიყენე წესები: references/compounds.md §2 („და“-ტესტი, გათიშვის ტესტი).');
}
console.log('\nწყაროები: ✗ — უარყოფილი ფორმების სია; • — კომპოზიტთა ლექსიკონი (2025, მოქმედი ნორმა); ◦ [1986] — 1986 წლის ნორმების საძიებელი (ახალ ნორმასთან წინააღმდეგობისას უპირატესია ახალი).');
console.log('აღნიშვნები: „მაგრამ:“ — მონათესავე ფორმა სხვა დაწერილობით; „//“ — პარალელური ვარიანტი; „[და არა …]“, „(და არა …)“, „[… კი არა]“ — უმართებულო ფორმა; „{…}“ — ფაკულტატიური ნაწილი.');
process.exit(found ? 0 : 1);
