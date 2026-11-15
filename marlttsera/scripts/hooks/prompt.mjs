#!/usr/bin/env node
// UserPromptSubmit hook: თუ მოთხოვნაში ქართული ტექსტია (ან ქართულად წერას ითხოვენ),
// მოდელს ახსენებს marlttsera სკილს. არასოდეს ბლოკავს და შეცდომისას ჩუმად გადის.
import { readFileSync } from 'node:fs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const prompt = String(input.prompt ?? '');
  const georgian = /[ა-ჿᲐ-Ჿ]/.test(prompt);
  const asksGeorgian = /\b(georgian|kartuli|qartul\w*|ka[-_]GE)\b/i.test(prompt);
  if (georgian || asksGeorgian) {
    const additionalContext =
      'marlttsera: this turn involves Georgian text. Before writing ANY Georgian (chat reply, file content, UI strings, commit messages, comments), ' +
      'load the `marlttsera` skill with the Skill tool if it has not been loaded in this conversation yet (reload after a context compaction), ' +
      'write according to its rules, and run its final self-check before sending. Do not skip this for short replies.';
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } }));
  }
} catch {
  // hook-მა მუშაობას ხელი არ უნდა შეუშალოს
}
process.exit(0);
