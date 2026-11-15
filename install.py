#!/usr/bin/env python3
"""marlttsera — ქართული მართლწერის სკილის ინსტალატორი Claude Code-ისთვის.

    python install.py              სკილი + hook-ები + მითითება CLAUDE.md-ში
    python install.py --no-hooks   hook-ების გარეშე
    python install.py --uninstall  ყველაფრის წაშლა

ხელახლა გაშვება უსაფრთხოა: არაფერი ორმაგდება. settings.json-ის შეცვლამდე იქმნება
სარეზერვო ასლი (settings.json.marlttsera-backup). სკილის სკრიპტებს Node.js 18+ სჭირდება.
"""

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "marlttsera"
CLAUDE = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
DEST = CLAUDE / "skills" / "marlttsera"
SETTINGS = CLAUDE / "settings.json"
CLAUDE_MD = CLAUDE / "CLAUDE.md"

MARK_START = "<!-- marlttsera:start -->"
MARK_END = "<!-- marlttsera:end -->"
MD_BLOCK = f"""{MARK_START}
# marlttsera (ქართული მართლწერა)
- Before writing or editing ANY Georgian text (chat replies, file contents, UI strings, commit messages, comments, translations into Georgian), load the `marlttsera` skill with the Skill tool and follow it, including its final self-check. Load it once per conversation and again after a context compaction. Trigger: Georgian script in the request or in the expected output, or `/marlttsera`.
- After writing Georgian text to a file, run the skill's `scripts/lint.mjs` on that file and fix the real errors it reports.
{MARK_END}"""

OUR_HOOK = re.compile(r"marlttsera[\\/]scripts[\\/]hooks[\\/]")


def fwd(p: Path) -> str:
    return str(p).replace("\\", "/")


def strip_hooks(settings: dict) -> None:
    hooks = settings.get("hooks") or {}
    for event in list(hooks):
        kept = []
        for entry in hooks[event] or []:
            inner = [h for h in entry.get("hooks", []) if not OUR_HOOK.search(str(h.get("command", "")))]
            if inner:
                kept.append({**entry, "hooks": inner})
        if kept:
            hooks[event] = kept
        else:
            del hooks[event]
    if hooks:
        settings["hooks"] = hooks
    else:
        settings.pop("hooks", None)


def update_settings(install_hooks: bool) -> None:
    settings = {}
    if SETTINGS.exists():
        raw = SETTINGS.read_text(encoding="utf-8")
        try:
            settings = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError as e:
            sys.exit(f"{SETTINGS} არასწორი JSON-ია ({e}); ფაილს არ შევეხე.")
        shutil.copyfile(SETTINGS, SETTINGS.with_name("settings.json.marlttsera-backup"))
    strip_hooks(settings)
    if install_hooks:
        hooks = settings.setdefault("hooks", {})
        prompt = f'node "{fwd(DEST / "scripts" / "hooks" / "prompt.mjs")}"'
        post = f'node "{fwd(DEST / "scripts" / "hooks" / "post-write.mjs")}"'
        hooks.setdefault("UserPromptSubmit", []).append(
            {"hooks": [{"type": "command", "command": prompt, "timeout": 5}]})
        hooks.setdefault("PostToolUse", []).append(
            {"matcher": "Write|Edit|MultiEdit|NotebookEdit",
             "hooks": [{"type": "command", "command": post, "timeout": 10}]})
    SETTINGS.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS.write_text(json.dumps(settings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update_claude_md(add: bool) -> None:
    md = CLAUDE_MD.read_text(encoding="utf-8") if CLAUDE_MD.exists() else ""
    md = re.sub(r"\n*" + re.escape(MARK_START) + r".*?" + re.escape(MARK_END) + r"\n*", "\n", md, flags=re.S)
    md = md.strip()
    if add:
        md = (md + "\n\n" if md else "") + MD_BLOCK
    CLAUDE_MD.parent.mkdir(parents=True, exist_ok=True)
    CLAUDE_MD.write_text(md + "\n" if md else "", encoding="utf-8")


def install(hooks: bool) -> None:
    if not (SRC / "SKILL.md").exists():
        sys.exit(f"ვერ ვიპოვე {SRC / 'SKILL.md'}")
    if DEST.exists():
        shutil.rmtree(DEST)
    shutil.copytree(SRC, DEST, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "evals"))
    print(f"სკილი დაკოპირდა: {DEST}")
    update_claude_md(True)
    print(f"მითითება დაემატა: {CLAUDE_MD}")
    update_settings(hooks)
    if hooks:
        print(f"hook-ები დარეგისტრირდა: {SETTINGS}")
    else:
        print("hook-ები არ დარეგისტრირებულა (--no-hooks).")
    if not shutil.which("node"):
        print("გაფრთხილება: Node.js ვერ ვიპოვე. hook-ებისა და სკრიპტების სამუშაოდ დააინსტალირე Node.js 18+.")
    print("მზადაა. ახალი სესია სკილს ავტომატურად დაინახავს; გაშვებულ სესიაში გახსენი /hooks ან გადატვირთე Claude Code.")


def uninstall() -> None:
    if DEST.exists():
        shutil.rmtree(DEST)
    update_settings(False)
    update_claude_md(False)
    print(f"წაიშალა: {DEST}; hook-ები და CLAUDE.md-ის ჩანაწერი ამოღებულია.")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="marlttsera სკილის ინსტალაცია Claude Code-ისთვის")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--uninstall", action="store_true", help="სკილის, hook-ებისა და CLAUDE.md-ის ჩანაწერის წაშლა")
    g.add_argument("--no-hooks", action="store_true", help="ინსტალაცია hook-ების გარეშე")
    args = ap.parse_args()
    if args.uninstall:
        uninstall()
    else:
        install(hooks=not args.no_hooks)


if __name__ == "__main__":
    main()
