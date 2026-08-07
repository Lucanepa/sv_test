# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static HTML/JS quiz app for Swiss Volleyball referee exam preparation ("SSK ZK Prep" / "Zentralkurs"). Questions cover volleyball rules and officiating scenarios, available in four languages (DE/EN/FR/IT). No build tools, no framework, no external dependencies — standalone HTML files served statically.

## Content Policy (critical)

Question and answer content must remain **VERBATIM** as on the Swiss Volley e-learning platform (triagonal), even where it seems wrong — translation quirks, typos, outdated rules and all. The exam grades against the platform's exact text. **Never rephrase, retranslate, or "correct" question content** in `questions_de/en/fr/it.json`.

## Architecture

**Entry point:** `index.html` — landing page with language and level selection. Loads `shared.js` (uses `checkDataVersion()`, `filterByLevel()`, `t()`) but keeps its own inline question-loading/diagram-caching logic and a few inline duplicates (`getSelectedLang`). Pre-caches questions + diagram images (as base64) into localStorage on load.

**Shared code (used by all four pages):**

- `shared.js` — language detection (`selectedLang` in localStorage, browser fallback), National/Regional level filter, question data loading + cache versioning, shuffle helpers, linked-question grouping, i18n UI strings (`t()`), `escapeHtml()`, search normalization/highlighting, `createIconsSafe()`.
- `styles.css` — shared styling.
- `lucide.min.js` — vendored lucide icons v1.25.0. Load via `<script src="lucide.min.js">`; never use a CDN URL.

**Three quiz modes (each an HTML file with inline JS on top of the shared files):**

- `card_game.html` — Flashcard mode. Shuffles all questions, shows one at a time, reveals correct answer immediately after checking. Tracks answered questions within a session.
- `test_real.html` — Exam simulation. Selects 25 random questions (crypto.getRandomValues for shuffle), allows free navigation between questions, then scores at the end. Grading: 90%+ SEHR GUT, 80%+ GUT, 66%+ GENUGEND, below UNGENUGEND.
- `check_question.html` — Reference browser. Displays all questions with correct answers highlighted, full-text search, responsive grid layout. Desktop keyboard shortcuts (Ctrl+F to focus search, Escape to clear).

**Data:**

- `questions_de.json` / `questions_en.json` / `questions_fr.json` / `questions_it.json` — the ACTIVE sources (~278 questions each), loaded as `'questions_' + lang + '.json'` by `shared.js` and `index.html`. Each question has `question_number`, `question`, `answers` (object keyed a/b/c/d/e), `correct` (array of keys), and `triagonal_quiz`/`triagonal_pos` — the quiz range and position where the question lives on the triagonal platform (its only user-visible numbering; regenerate by text-matching against a fresh platform harvest if the catalog changes). Some questions have `linked_to`, `link_order` for multi-part sequences, and `image_url` for diagram references. All four files must stay structurally in sync: same `question_number`s, same answer counts per question. The a/b/c KEY ORDER differs per language by design — do not "align" it. Known exception: q180 has 3 correct answers in IT but 2 in DE/EN/FR because the platform itself disagrees across languages (verified against triagonal 2026-07); the verbatim policy means each file mirrors its own platform language, so do not "fix" this.
- `questions_with_diagrams_updated.json` — LEGACY, unused by the app. Never edit it.
- `metadata.json` — `testYear` and `lastUpdated`; drives cache invalidation (see below).
- `diagram_*.png` — Court diagrams referenced by questions.

## Key Patterns

**Linked questions:** Some questions form ordered sequences (`linked_to` references a base question number, `link_order` determines sequence). Each mode processes these differently — card game shows them sequentially after the first is answered correctly, test mode keeps them adjacent, check mode displays them grouped.

**Offline caching:** localStorage keys are `offlineQuestions_<lang>`, `offlineDiagrams`, and `offlineDataVersion`. Quiz pages load from cache first, falling back to fetch. `checkDataVersion()` in `shared.js` fetches `metadata.json` and, when `lastUpdated` changed, clears all question/diagram caches. **ALWAYS run `./update_questions.sh` after changing question JSONs** — otherwise returning users keep stale cached data.

**Level toggle:** National/Regional (`selectedLevel` in localStorage). Regional mode hides national-only questions: `isNationalOnly()` in `shared.js` matches league abbreviations/keywords, plus the pinned `NATIONAL_ONLY_QUESTION_NUMBERS` set — the union of term matches across all four languages, so filtering is identical in every language. After question updates, regenerate that set by running `isNationalOnly`'s patterns over all four JSON files and taking the union of matching question numbers.

**Answer shuffling:** `card_game.html` and `test_real.html` randomize answer option order on display so the letter key (a/b/c) is not a visual cue. `check_question.html` deliberately preserves file order.

## Development

No build step. Open `index.html` in a browser or serve with any static server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

**Checking triagonal for new/changed questions:** harvest the platform with the local (gitignored) `extract_questions.py`, then diff it against the committed data:

```bash
./compare_triagonal.py harvest_de.json de     # exits 1 if anything differs
```

`compare_triagonal.py` needs no network and no credentials — it only compares. It matches questions by text (not by `question_number`, which is internal numbering) and compares answers and correct answers **by text rather than by a/b/c key**, so the per-language key order that differs by design never shows up as a false difference. It reports only; porting any real difference across all four language files is a manual, verbatim job.

When modifying the question JSONs, ensure the structure matches: `question_number` (int), `question` (string), `answers` (object), `correct` (array of answer keys). For linked questions, include `linked_to` (int, base question number), `link_order` (int, 1-based sequence position). Apply structural changes to all four language files, then run `./update_questions.sh`.
