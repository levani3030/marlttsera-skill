#!/usr/bin/env node
// martltsera lint — ქართული ტექსტის მექანიკური შემმოწმებელი.
// იჭერს მხოლოდ იმას, რისი დაჭერაც წესით/სიით შეიძლება (აკრძალული ფორმები, ტიპოგრაფიკა,
// შერეული დამწერლობა, აშკარა პუნქტუაცია). გრამატიკასა და სტილს მოდელი თავად ამოწმებს.
//
// გამოყენება:
//   node lint.mjs [--json] [--min=error|warn|info] [--mode=prose|code|auto] <ფაილი>...
//   node lint.mjs --stdin [--mode=prose] < ტექსტი
//   node lint.mjs --text "შესამოწმებელი ტექსტი"
// გასვლის კოდი: 0 — სუფთაა (ან მხოლოდ info), 1 — არის error/warn, 2 — გაშვების შეცდომა.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');

const G = 'ა-ჰ'; // თანამედროვე ქართული ანბანი (მხედრული)
const GEO_RE = /[ა-ჿᲐ-Ჿ]/;
const LEVELS = { error: 3, warn: 2, info: 1 };
const PROSE_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc', '']);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- მონაცემების ჩატვირთვა ----------
// data/wordlist.tsv: kind <TAB> pattern <TAB> suggestion <TAB> level <TAB> note
//   kind = word   — მთლიანი სიტყვა ზუსტად
//          stem   — სიტყვის დასაწყისი (ნებისმიერი ქართული დაბოლოებით); suggestion — სწორი ფუძე
//          phrase — ფრაზა (სიტყვის საზღვრებით ორივე მხარეს)
//          re     — JS რეგულარული გამოსახულება
function loadWordlist() {
  const rules = [];
  const file = join(DATA, 'wordlist.tsv');
  if (!existsSync(file)) return rules;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/­/g, '');
    if (!line.trim() || line.startsWith('#')) return;
    const [kind, pattern, suggestion = '', level = 'warn', note = ''] = line.split('\t');
    if (!pattern) return;
    let re;
    try {
      if (kind === 'word') re = new RegExp(`(?<![${G}])${esc(pattern)}(?![${G}])`, 'g');
      else if (kind === 'stem') re = new RegExp(`(?<![${G}])${esc(pattern)}(?=[${G}]*)`, 'g');
      else if (kind === 'phrase') re = new RegExp(`(?<![${G}])${esc(pattern).replace(/ /g, '\\s+')}(?![${G}])`, 'g');
      else if (kind === 're') re = new RegExp(pattern, 'g');
      else throw new Error(`უცნობი kind: ${kind}`);
    } catch (e) {
      process.stderr.write(`wordlist.tsv:${i + 1}: ${e.message}\n`);
      return;
    }
    rules.push({ id: 'LEX', re, suggestion, level: LEVELS[level] ? level : 'warn', note, kind, pattern });
  });
  return rules;
}

// ---------- ჩაშენებული წესები ----------
const CONJ_NO_COMMA_BEFORE = ['და', 'ან', 'თუ', 'ანდა', 'კი', 'არამედ', 'მაგრამ', 'ხოლო', 'რომ', 'ვიდრე', 'თუნდაც', 'მხოლოდ', 'სწორედ', 'აი', 'არც'];
const prevWordOk = (text, idx) => {
  const m = text.slice(0, idx).match(new RegExp(`([${G}]+)\\s*$`));
  return m ? CONJ_NO_COMMA_BEFORE.includes(m[1]) : true;
};

const builtin = [
  {
    id: 'MIX', level: 'error', modes: ['prose', 'code'],
    re: new RegExp(`(?<![\\\\A-Za-z\\u0400-\\u04FF${G}])(?:[A-Za-z\\u0400-\\u04FF]+[${G}]|[${G}]+[A-Za-z\\u0400-\\u04FF])[A-Za-z\\u0400-\\u04FF${G}]*`, 'g'),
    msg: 'ქართულ ასოს უშუალოდ ეკვრის ლათინური/კირილური ასო: ან ასოა არეული, ან უცხო სიტყვას ბრუნვის ნიშანი დეფისის გარეშე ერთვის (სწორია: Windows-ის, PDF-ფაილი)',
  },
  {
    id: 'SPACE-BEFORE', level: 'warn', modes: ['prose', 'code'],
    re: new RegExp(`[${G}][ \\t]+[,;!?](?=[\\s"“)]|$)|[${G}][ \\t]+\\.(?=\\s|$)`, 'g'),
    msg: 'სასვენი ნიშნის წინ ჰარი არ იწერება',
  },
  {
    id: 'SPACE-AFTER', level: 'warn', modes: ['prose', 'code'],
    re: new RegExp(`[${G}][,;!?][${G}]`, 'g'),
    msg: 'სასვენი ნიშნის შემდეგ ჰარია საჭირო',
  },
  {
    id: 'DUP', level: 'warn', modes: ['prose', 'code'],
    re: new RegExp(`(?<![${G}-])([${G}]{2,})[ \\t]+\\1(?![${G}-])`, 'g'),
    filter: (text, m) => !['მას', 'მათ', 'იმ', 'ამ', 'ის', 'ეს', 'რა', 'ვინ'].includes(m[1]),
    msg: 'სიტყვა ორჯერ ზედიზედ წერია (გამეორება დეფისით იწერება: ნელ-ნელა; თუ შეცდომაა — ამოშალე)',
  },
  {
    id: 'QUOTE', level: 'info', modes: ['prose'],
    re: new RegExp(`"[^"\\n]*[${G}][^"\\n]*"|“[^“”\\n]*[${G}][^“”\\n]*”|«[^»\\n]*[${G}][^»\\n]*»|„[^“”\\n]*[${G}][^“”\\n]*”`, 'g'),
    msg: 'ქართულ ტექსტში ბრჭყალებია „ “ (გახსნა U+201E, დახურვა U+201C)',
  },
  {
    id: 'DASH', level: 'info', modes: ['prose'],
    re: new RegExp(`(?<=[${G}0-9“)%]) - (?=[${G}0-9„(])`, 'g'),
    msg: 'ჰარებით გამოყოფილი დეფისი ტირეს ნაცვლად: წინადადებაში ტირე (–/—) იწერება, დეფისი — მხოლოდ სიტყვის შიგნით, უჰაროდ',
  },
  {
    id: 'COMMA-CONJ', level: 'warn', modes: ['prose', 'code'],
    re: new RegExp(`(?<=[${G}0-9“)])[ \\t]+(მაგრამ|რადგან|რადგანაც|ვინაიდან|რათა|თუმცა|ხოლო|არამედ|რომელიც|რომლებიც|რომელსაც|რომელმაც|რომლის|რომლისაც|რომლითაც|რომელთაც|რომელშიც|რომელზეც|რომელთანაც|რომლისგანაც|რომლისთვისაც|რომლებსაც|რომლებმაც|რომლებშიც|რომლებზეც|რომელთა)(?![${G}])`, 'g'),
    filter: (text, m) => !prevWordOk(text, m.index),
    msg: 'ამ კავშირის/მიმართებითი სიტყვის წინ, როგორც წესი, მძიმე იწერება — შეამოწმე',
  },
  {
    id: 'COMMA-ROM', level: 'warn', modes: ['prose', 'code'],
    re: new RegExp(`(?<![${G}])(ვფიქრობ|ვფიქრობთ|მგონია|ვიცი|ვიცით|იცის|იცოდა|ამბობს|ამბობენ|თქვა|თქვეს|ნიშნავს|ჩანს|აღმოჩნდა|ვხედავ|ვხედავთ|მჯერა|გვჯერა|ვიმედოვნებ|ვიმედოვნებთ|დარწმუნდით|დარწმუნდი|გაითვალისწინეთ|გაითვალისწინე|გახსოვდეთ|გახსოვდეს|იმიტომ|ისე|იმისთვის|იმისათვის|იმდენად|იმის გამო|მიუხედავად იმისა)[ \\t]+რომ(?![${G}])`, 'g'),
    msg: '„რომ“ კავშირის წინ მძიმე იწერება (ვფიქრობ, რომ…; იმიტომ, რომ…)',
  },
  {
    id: 'ELLIPSIS', level: 'info', modes: ['prose'],
    re: new RegExp(`[${G}]\\.\\.(?![.])`, 'g'),
    msg: 'მრავალწერტილი სამი წერტილია (…)',
  },
];

// ---------- ტექსტის მომზადება ----------
// კოდის ბლოკებს, inline-კოდსა და URL-ებს ჰარებით ვფარავთ, რომ სვეტები არ აირიოს.
function maskProse(text) {
  // „¤“ — ნეიტრალური შემვსები: არც ქართული ასოა, არც ჰარი, ამიტომ წესები მასზე არ რეაგირებს
  const blank = (s) => s.replace(/[^\n]/g, '¤');
  return text
    .replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[^\n]*$/gm, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(/https?:\/\/\S+/g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
}

function lintText(text, mode, lexRules) {
  const src = text.replace(/­/g, '');
  const body = mode === 'prose' ? maskProse(src) : src.replace(/https?:\/\/\S+/g, (s) => ' '.repeat(s.length));
  const lineStarts = [0];
  for (let i = 0; i < body.length; i++) if (body[i] === '\n') lineStarts.push(i + 1);
  const pos = (idx) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, col: idx - lineStarts[lo] + 1 };
  };
  const lines = src.split('\n');
  const out = [];
  const push = (rule, m, message, suggestion) => {
    const { line, col } = pos(m.index);
    out.push({ rule: rule.id, level: rule.level, line, col, match: m[0].trim(), message, suggestion: suggestion || '', context: (lines[line - 1] || '').trim().slice(0, 160) });
  };
  for (const r of builtin) {
    if (!r.modes.includes(mode)) continue;
    r.re.lastIndex = 0;
    for (const m of body.matchAll(r.re)) {
      if (r.filter && !r.filter(body, m)) continue;
      push(r, m, r.msg);
    }
  }
  for (const r of lexRules) {
    for (const m of body.matchAll(r.re)) {
      push(r, m, r.note || 'ნორმით უარყოფილი ან არასასურველი ფორმა', r.suggestion);
    }
  }
  out.sort((a, b) => a.line - b.line || a.col - b.col || b.match.length - a.match.length);
  // ერთსა და იმავე ადგილას რამდენიმე LEX-დამთხვევიდან რჩება ყველაზე გრძელი
  return out.filter((f, i) => !(f.rule === 'LEX' && out.some((g, j) => j < i && g.rule === 'LEX' && g.line === f.line && g.col <= f.col && g.col + g.match.length >= f.col + f.match.length)));
}

// ---------- CLI ----------
function main() {
  const args = process.argv.slice(2);
  const opt = { json: false, min: 'info', mode: 'auto', stdin: false, text: null, files: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') opt.json = true;
    else if (a === '--stdin') opt.stdin = true;
    else if (a === '--text') opt.text = args[++i] ?? '';
    else if (a.startsWith('--min=')) opt.min = a.slice(6);
    else if (a.startsWith('--mode=')) opt.mode = a.slice(7);
    else if (a === '-h' || a === '--help') { console.log('node lint.mjs [--json] [--min=error|warn|info] [--mode=prose|code|auto] <ფაილი>... | --stdin | --text "..."'); return 0; }
    else opt.files.push(a);
  }
  const lex = loadWordlist();
  const inputs = [];
  if (opt.text !== null) inputs.push({ name: '<text>', text: opt.text, mode: opt.mode === 'auto' ? 'prose' : opt.mode });
  if (opt.stdin) inputs.push({ name: '<stdin>', text: readFileSync(0, 'utf8'), mode: opt.mode === 'auto' ? 'prose' : opt.mode });
  for (const f of opt.files) {
    if (!existsSync(f)) { process.stderr.write(`ვერ ვიპოვე: ${f}\n`); return 2; }
    const mode = opt.mode === 'auto' ? (PROSE_EXT.has(extname(f).toLowerCase()) ? 'prose' : 'code') : opt.mode;
    inputs.push({ name: f, text: readFileSync(f, 'utf8'), mode });
  }
  if (!inputs.length) { process.stderr.write('მიუთითე ფაილი, --stdin ან --text\n'); return 2; }
  const min = LEVELS[opt.min] || 1;
  const report = [];
  for (const inp of inputs) {
    if (!GEO_RE.test(inp.text)) continue;
    for (const f of lintText(inp.text, inp.mode, lex)) if (LEVELS[f.level] >= min) report.push({ file: inp.name, ...f });
  }
  if (opt.json) console.log(JSON.stringify(report, null, 2));
  else if (!report.length) console.log('martltsera lint: მექანიკური შეცდომა ვერ ვიპოვე (გრამატიკა და სტილი მაინც თავად გადაამოწმე).');
  else {
    for (const f of report) console.log(`${f.file}:${f.line}:${f.col} [${f.level}] ${f.rule}: „${f.match}“ — ${f.message}${f.suggestion ? ` → ${f.suggestion}` : ''}`);
    const n = (l) => report.filter((f) => f.level === l).length;
    console.log(`\nსულ: ${n('error')} error, ${n('warn')} warn, ${n('info')} info. warn/info მინიშნებაა — გადაამოწმე კონტექსტში, ბრმად ნუ შეცვლი.`);
  }
  return report.some((f) => LEVELS[f.level] >= 2) ? 1 : 0;
}

export { lintText, loadWordlist, GEO_RE };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
