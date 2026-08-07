#!/usr/bin/env python3
"""Diff a fresh triagonal harvest against the committed question JSONs.

The harvest itself must be produced by the (gitignored) extraction script,
since triagonal requires a login. This tool does the comparison only, so it
needs no network and no credentials.

Usage:
    ./compare_triagonal.py harvest_de.json de
    ./compare_triagonal.py harvest_de.json de --json report.json

Expected harvest format: a JSON list of objects with at least

    {"question": "...", "answers": {"a": "...", "b": "..."}, "correct": ["a"]}

`question_number` is optional and ignored for matching -- it is our internal
numbering, not the platform's. Matching is done on question text.

Two deliberate design choices, both required by the repo's content policy:

  * Answers are compared as SETS OF TEXT, never by their a/b/c keys. The key
    order differs per language by design and the platform reshuffles it, so
    key-based comparison would produce constant false positives.
  * Correct answers are likewise compared by the TEXT they point at, not by
    key, for the same reason.

Nothing is written back to the question files. This reports; a human decides.
"""

import difflib
import json
import re
import sys
import unicodedata

LANGS = ("de", "en", "fr", "it")
# Below this ratio two questions are treated as unrelated rather than reworded.
FUZZY_THRESHOLD = 0.82


def norm(s):
    """Normalize for MATCHING only. Diffs are always reported on original text."""
    s = unicodedata.normalize("NFKC", str(s))
    s = s.replace(" ", " ")
    s = re.sub(r"[‘’‛]", "'", s)
    s = re.sub(r"[“”„]", '"', s)
    s = re.sub(r"[‐-―]", "-", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()


def answer_texts(q):
    return {norm(v) for v in q.get("answers", {}).values()}


def correct_texts(q):
    """Set of normalized texts of the answers marked correct."""
    answers = q.get("answers", {})
    return {norm(answers[k]) for k in q.get("correct", []) if k in answers}


def load(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        sys.exit(f"error: {path} must contain a JSON list, got {type(data).__name__}")
    for i, q in enumerate(data):
        if "question" not in q or "answers" not in q:
            sys.exit(f"error: {path}[{i}] is missing 'question' or 'answers'")
    return data


def pair_up(db, harvest):
    """Return (matched, db_only, harvest_only).

    Pass 1 matches identical normalized question text. Pass 2 fuzzy-matches
    the leftovers so a reworded question reads as 'changed', not as one
    removal plus one addition.
    """
    by_text = {}
    for q in db:
        by_text.setdefault(norm(q["question"]), []).append(q)

    matched, harvest_left = [], []
    for h in harvest:
        bucket = by_text.get(norm(h["question"]))
        if bucket:
            matched.append((bucket.pop(0), h))
        else:
            harvest_left.append(h)
    db_left = [q for bucket in by_text.values() for q in bucket]

    still_new = []
    for h in harvest_left:
        best, best_ratio = None, 0.0
        hn = norm(h["question"])
        for d in db_left:
            r = difflib.SequenceMatcher(None, hn, norm(d["question"])).ratio()
            if r > best_ratio:
                best, best_ratio = d, r
        if best is not None and best_ratio >= FUZZY_THRESHOLD:
            matched.append((best, h))
            db_left.remove(best)
        else:
            still_new.append(h)

    return matched, db_left, still_new


def compare(db, harvest):
    matched, db_only, harvest_only = pair_up(db, harvest)

    changes = []
    for d, h in matched:
        c = {"question_number": d.get("question_number"), "diffs": []}
        if norm(d["question"]) != norm(h["question"]):
            c["diffs"].append({"field": "question", "db": d["question"], "triagonal": h["question"]})

        db_ans, h_ans = answer_texts(d), answer_texts(h)
        if db_ans != h_ans:
            c["diffs"].append({
                "field": "answers",
                "only_in_db": sorted(db_ans - h_ans),
                "only_in_triagonal": sorted(h_ans - db_ans),
            })
        if len(d.get("answers", {})) != len(h.get("answers", {})):
            c["diffs"].append({
                "field": "answer_count",
                "db": len(d.get("answers", {})),
                "triagonal": len(h.get("answers", {})),
            })

        db_cor, h_cor = correct_texts(d), correct_texts(h)
        if db_cor != h_cor:
            c["diffs"].append({
                "field": "correct",
                "only_in_db": sorted(db_cor - h_cor),
                "only_in_triagonal": sorted(h_cor - db_cor),
            })
        if c["diffs"]:
            changes.append(c)

    return {
        "counts": {"db": len(db), "triagonal": len(harvest), "matched": len(matched)},
        "new_on_triagonal": harvest_only,
        "missing_from_triagonal": db_only,
        "changed": changes,
    }


def snip(s, n=100):
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1] + "…"


def word_diff(a, b, indent):
    """Print a word-level diff so a small edit inside a long question is visible.

    Plain truncated side-by-side output hides changes past the cut-off, which
    is exactly where reworded questions tend to differ.
    """
    aw, bw = " ".join(str(a).split()).split(" "), " ".join(str(b).split()).split(" ")
    sm = difflib.SequenceMatcher(None, [w.lower() for w in aw], [w.lower() for w in bw])
    shown = False
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        shown = True
        ctx_before = " ".join(aw[max(0, i1 - 6):i1])
        ctx_after = " ".join(aw[i2:i2 + 6])
        if tag in ("replace", "delete"):
            print(f"{indent}db        : …{ctx_before} [-{' '.join(aw[i1:i2])}-] {ctx_after}…")
        if tag in ("replace", "insert"):
            print(f"{indent}triagonal : …{ctx_before} [+{' '.join(bw[j1:j2])}+] {ctx_after}…")
    if not shown:
        print(f"{indent}(differs only in whitespace/punctuation)")
        print(f"{indent}db        : {snip(a, 88)}")
        print(f"{indent}triagonal : {snip(b, 88)}")


def report(r, lang):
    print(f"=== questions_{lang}.json  vs  triagonal harvest ===\n")
    c = r["counts"]
    print(f"  in local DB      : {c['db']}")
    print(f"  in harvest       : {c['triagonal']}")
    print(f"  matched up       : {c['matched']}")
    print(f"  new on triagonal : {len(r['new_on_triagonal'])}")
    print(f"  gone from triagonal: {len(r['missing_from_triagonal'])}")
    print(f"  changed          : {len(r['changed'])}\n")

    if r["new_on_triagonal"]:
        print("-- NEW on triagonal (not in local DB) " + "-" * 30)
        for q in r["new_on_triagonal"]:
            print(f"  + {snip(q['question'])}")
            for k, v in q.get("answers", {}).items():
                mark = "*" if k in q.get("correct", []) else " "
                print(f"      {mark}{k}) {snip(v, 88)}")
            print()

    if r["missing_from_triagonal"]:
        print("-- IN LOCAL DB but not found on triagonal " + "-" * 26)
        for q in r["missing_from_triagonal"]:
            print(f"  - q{q.get('question_number')}: {snip(q['question'])}")
        print()

    if r["changed"]:
        print("-- CHANGED " + "-" * 56)
        for ch in r["changed"]:
            print(f"  q{ch['question_number']}:")
            for d in ch["diffs"]:
                f = d["field"]
                if f == "question":
                    print(f"      text:")
                    word_diff(d["db"], d["triagonal"], "        ")
                elif f == "answer_count":
                    print(f"      answer count: db={d['db']} triagonal={d['triagonal']}")
                else:
                    print(f"      {f}:")
                    # A single swap on each side is almost always a reword of the
                    # same option, so show what actually changed inside it.
                    if len(d["only_in_db"]) == 1 and len(d["only_in_triagonal"]) == 1:
                        word_diff(d["only_in_db"][0], d["only_in_triagonal"][0], "        ")
                    else:
                        for t in d["only_in_db"]:
                            print(f"        only in db       : {snip(t, 80)}")
                        for t in d["only_in_triagonal"]:
                            print(f"        only in triagonal: {snip(t, 80)}")
            print()

    if not (r["new_on_triagonal"] or r["missing_from_triagonal"] or r["changed"]):
        print("No differences found.\n")

    print("Reminder: question content is VERBATIM from the platform. Port any")
    print("difference across all four language files, then run ./update_questions.sh.")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        sys.exit(__doc__)
    harvest_path, lang = args[0], args[1]
    if lang not in LANGS:
        sys.exit(f"error: lang must be one of {', '.join(LANGS)}")

    db = load(f"questions_{lang}.json")
    harvest = load(harvest_path)
    result = compare(db, harvest)
    report(result, lang)

    if "--json" in sys.argv:
        i = sys.argv.index("--json")
        if i + 1 < len(sys.argv):
            with open(sys.argv[i + 1], "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"\nWrote machine-readable report to {sys.argv[i + 1]}")

    has_changes = bool(
        result["new_on_triagonal"] or result["missing_from_triagonal"] or result["changed"]
    )
    sys.exit(1 if has_changes else 0)


if __name__ == "__main__":
    main()
