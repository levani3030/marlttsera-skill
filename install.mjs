#!/usr/bin/env node
// marlttsera — ქართული მართლწერის სკილის ინსტალატორი Claude Code-ისთვის (Node.js ვერსია; იგივეა, რაც install.py).
// ავტორი: Levani3030 (Rostevan). ლიცენზია: MIT.
//   node install.mjs              — სკილი + hook-ები + მითითება CLAUDE.md-ში
//   node install.mjs --no-hooks   — hook-ების გარეშე
//   node install.mjs --uninstall  — ყველაფრის წაშლა
// ხელახლა გაშვება უსაფრთხოა: არაფერი ორმაგდება. settings.json-ის შეცვლამდე იქმნება სარეზერვო ასლი
// (settings.json.marlttsera-backup). install.py-სა და install.mjs-ს ერთმანეთის ინსტალაციის წაშლა შეუძლიათ.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'marlttsera');
const CLAUDE = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const DEST = join(CLAUDE, 'skills', 'marlttsera');
const SETTINGS = join(CLAUDE, 'settings.json');
const CLAUDE_MD = join(CLAUDE, 'CLAUDE.md');
const args = new Set(process.argv.slice(2));
const fwd = (p) => p.replace(/\\/g, '/');

const MARK_START = '<!-- marlttsera:start -->';
const MARK_END = '<!-- marlttsera:end -->';
const MD_BLOCK = `${MARK_START}
# marlttsera (ქართული მართლწერა)
- Before writing or editing ANY Georgian text (chat replies, file contents, UI strings, commit messages, comments, translations into Georgian), load the \`marlttsera\` skill with the Skill tool and follow it, including its final self-check. Load it once per conversation and again after a context compaction. Trigger: Georgian script in the request or in the expected output, or \`/marlttsera\`.
- After writing Georgian text to a file, run the skill's \`scripts/lint.mjs\` on that file and fix the real errors it reports.
${MARK_END}`;

const isOurs = (h) => typeof h?.command === 'string' && /marlttsera[\\/]scripts[\\/]hooks[\\/]/.test(h.command);

function stripHooks(settings) {
  const hooks = settings.hooks ?? {};
  for (const ev of Object.keys(hooks)) {
    hooks[ev] = (hooks[ev] ?? [])
      .map((entry) => ({ ...entry, hooks: (entry.hooks ?? []).filter((h) => !isOurs(h)) }))
      .filter((entry) => entry.hooks.length > 0);
    if (!hooks[ev].length) delete hooks[ev];
  }
  if (Object.keys(hooks).length) settings.hooks = hooks;
  else delete settings.hooks;
}

function updateSettings(installHooks) {
  let settings = {};
  if (existsSync(SETTINGS)) {
    const raw = readFileSync(SETTINGS, 'utf8');
    try {
      settings = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      console.error(`${SETTINGS} არასწორი JSON-ია (${e.message}); ფაილს არ შევეხე.`);
      process.exit(1);
    }
    copyFileSync(SETTINGS, join(CLAUDE, 'settings.json.marlttsera-backup'));
  }
  stripHooks(settings);
  if (installHooks) {
    const hooks = (settings.hooks ??= {});
    const prompt = `node "${fwd(join(DEST, 'scripts', 'hooks', 'prompt.mjs'))}"`;
    const post = `node "${fwd(join(DEST, 'scripts', 'hooks', 'post-write.mjs'))}"`;
    (hooks.UserPromptSubmit ??= []).push({ hooks: [{ type: 'command', command: prompt, timeout: 5 }] });
    (hooks.PostToolUse ??= []).push({ matcher: 'Write|Edit|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: post, timeout: 10 }] });
  }
  mkdirSync(CLAUDE, { recursive: true });
  writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

function updateClaudeMd(add) {
  let md = existsSync(CLAUDE_MD) ? readFileSync(CLAUDE_MD, 'utf8') : '';
  md = md.replace(new RegExp(`\\n*${MARK_START}[\\s\\S]*?${MARK_END}\\n*`), '\n').trim();
  if (add) md = (md ? `${md}\n\n` : '') + MD_BLOCK;
  mkdirSync(CLAUDE, { recursive: true });
  writeFileSync(CLAUDE_MD, md ? `${md}\n` : '');
}

if (args.has('--uninstall')) {
  if (existsSync(DEST)) rmSync(DEST, { recursive: true, force: true });
  updateSettings(false);
  updateClaudeMd(false);
  console.log(`წაიშალა: ${DEST}; hook-ები და CLAUDE.md-ის ჩანაწერი ამოღებულია.`);
} else {
  if (!existsSync(join(SRC, 'SKILL.md'))) {
    console.error(`ვერ ვიპოვე ${join(SRC, 'SKILL.md')}`);
    process.exit(1);
  }
  if (existsSync(DEST)) rmSync(DEST, { recursive: true, force: true });
  mkdirSync(dirname(DEST), { recursive: true });
  cpSync(SRC, DEST, { recursive: true, filter: (p) => !/[\\/](evals|node_modules|__pycache__)([\\/]|$)/.test(p) });
  console.log(`სკილი დაკოპირდა: ${DEST}`);
  updateClaudeMd(true);
  console.log(`მითითება დაემატა: ${CLAUDE_MD}`);
  const withHooks = !args.has('--no-hooks');
  updateSettings(withHooks);
  console.log(withHooks ? `hook-ები დარეგისტრირდა: ${SETTINGS}` : 'hook-ები არ დარეგისტრირებულა (--no-hooks).');
  console.log('მზადაა. ახალი სესია სკილს ავტომატურად დაინახავს; გაშვებულ სესიაში გახსენი /hooks ან გადატვირთე Claude Code.');
}
