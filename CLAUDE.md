# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static HTML/JS quiz app for Swiss Volleyball referee exam preparation ("SSK ZK Prep" / "Zentralkurs"). Questions are in Italian, covering volleyball rules and officiating scenarios. No build tools, no framework, no dependencies — just standalone HTML files served statically.

## Architecture

**Entry point:** `index.html` — landing page that links to three modes and auto-caches questions + diagrams to localStorage on first load.

**Three quiz modes (each a self-contained HTML file with inline CSS/JS):**

- `card_game.html` — Flashcard mode. Shuffles all questions, shows one at a time, reveals correct answer immediately after checking. Tracks answered questions within a session.
- `test_real.html` — Exam simulation. Selects 25 random questions (crypto.getRandomValues for shuffle), allows free navigation between questions, then scores at the end. Grading: 90%+ SEHR GUT, 80%+ GUT, 66%+ GENUGEND, below UNGENUGEND.
- `check_question.html` — Reference browser. Displays all questions with correct answers highlighted, full-text search, responsive grid layout. Desktop keyboard shortcuts (Ctrl+F to focus search, Escape to clear).

**Data:**

- `questions_with_diagrams_updated.json` — ~278 questions. Each has `question_number`, `question`, `answers` (object keyed a/b/c/d/e), `correct` (array of keys). Some questions have `linked_to`, `link_order` for multi-part question sequences, and `image_url` for diagram references.
- `diagram_*.png` / `diagram *.png` — Court diagrams referenced by questions.

## Key Patterns

**Linked questions:** Some questions form ordered sequences (`linked_to` references a base question number, `link_order` determines sequence). Each mode processes these differently — card game shows them sequentially after the first is answered correctly, test mode keeps them adjacent, check mode displays them grouped.

**Offline caching:** `index.html` caches both the JSON and diagram images (as base64) into localStorage. All three quiz pages attempt to load from localStorage first, falling back to fetch. The caching keys are `offlineQuestions` and `offlineDiagrams`.

**Answer shuffling:** All modes randomize answer option order on display so the letter key (a/b/c) is not a visual cue.

## Development

No build step. Open `index.html` in a browser or serve with any static server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

When modifying the question JSON, ensure the structure matches: `question_number` (int), `question` (string), `answers` (object), `correct` (array of answer keys). For linked questions, include `linked_to` (int, base question number), `link_order` (int, 1-based sequence position).
