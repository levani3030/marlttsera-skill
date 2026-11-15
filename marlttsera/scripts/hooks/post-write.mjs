#!/usr/bin/env node
// PostToolUse hook (Write|Edit|MultiEdit|NotebookEdit): ახლად ჩაწერილ ქართულ ტექსტს
// მექანიკურ შემმოწმებელში ატარებს და ნაპოვნს მოდელს უბრუნებს. არასოდეს ბლოკავს.
// მოწმდება მხოლოდ ის, რაც ამ გამოძახებით ჩაიწერა (და არა მთელი ფაილი), რომ ძველ ტექსტზე ხმაური არ იყოს.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { lintText, loadWordlist, GEO_RE } from '../lint.mjs';

const PROSE_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc', '']);
const MAX_FINDINGS = 12;

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const ti = input.tool_input ?? {};
  const file = String(ti.file_path ?? ti.notebook_path ?? '');
  const chunks = [];
  if (typeof ti.content === 'string') chunks.push(ti.content);
  if (typeof ti.new_string === 'string') chunks.push(ti.new_string);
  if (typeof ti.new_source === 'string') chunks.push(ti.new_source);
  if (Array.isArray(ti.edits)) for (const e of ti.edits) if (typeof e?.new_string === 'string') chunks.push(e.new_string);
  const text = chunks.join('\n');
  // სკილის საკუთარ ფაილებს არ ვამოწმებთ: იქ არასწორი ფორმები განზრახ წერია მაგალითებად.
  const own = /[\\/]marlttsera[\\/]/i.test(file);
  if (text && GEO_RE.test(text) && !own) {
    const mode = PROSE_EXT.has(extname(file).toLowerCase()) ? 'prose' : 'code';
    // კორექტურის შენიშვნებში არასწორი ფორმა განზრახ არის ციტირებული („იყო → გახდა“, ✗) — ასეთ სტრიქონებს ვტოვებთ
    const QUOTED = /→|✗|არასწორ|უმართებულო|შეცდომა:/;
    const findings = lintText(text, mode, loadWordlist()).filter((f) => f.level !== 'info' && !QUOTED.test(f.context));
    if (findings.length) {
      const shown = findings.slice(0, MAX_FINDINGS).map((f) => `- [${f.level}] ${f.rule}: „${f.match}“ — ${f.message}${f.suggestion ? ` → ${f.suggestion}` : ''}`);
      const more = findings.length > MAX_FINDINGS ? `\n(+ ${findings.length - MAX_FINDINGS} more; run the skill's scripts/lint.mjs on the file for the full list)` : '';
      const additionalContext =
        `marlttsera lint flagged the Georgian text just written to ${file || 'the file'}:\n${shown.join('\n')}${more}\n` +
        'Review each one in context against the marlttsera skill (load it if it is not loaded) and fix the real errors; a flag can be a false positive, so do not change text blindly.';
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }));
    }
  }
} catch {
  // hook-მა მუშაობას ხელი არ უნდა შეუშალოს
}
process.exit(0);
