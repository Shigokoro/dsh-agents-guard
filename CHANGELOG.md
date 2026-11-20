# Changelog

## 0.4.1

- `agents_memory` no longer accepts model-supplied `source` or `authority`; the host records model notes as `model-inferred` or `assumption`. User messages are indexed as `user-stated`.
- `mergeMemory` deduplicates runtime entries against the projection by content key and removes duplicated cache entries.
- Gate coverage adds a mutating-tool classifier (`apply_patch`, `terminal`, `push_files`, etc.) beyond the configured name lists.

## 0.4.0

- `ask_user` now moves ambiguity and reasoning gates to WAITING; it no longer clears them. The gates stay blocked until a user answer (or, for reasoning, a successful read-only verification).
- `agents_memory` entries carry an authority level: user-confirmed, user-stated, tested, model-inferred, or assumption. The card and Markdown index show it.

## 0.3.2

- Redacts GitHub PATs, classic tokens, and Bearer tokens before storing or rendering the session index, cards, and agents_memory entries.
- Adds the standalone GitHub repository layout and CI workflow to the initial upload.

## 0.3.1

- Read-only verification clears the reasoning gate; `agents_memory` records evidence but does not clear it.
- Failed verification does not clear the gate.
- Answer-card messages (`【回答 …】` or containing `→`) are not treated as new ambiguous requests.
- Reasoning cues narrowed to explicit uncertainty and self-questions; ordinary planning phrases are ignored.
- `agents_memory` persists entries through a runtime store and writes the Markdown index immediately.
- Standalone GitHub repository layout: `.gitignore`, `.gitattributes`, `LICENSE`, `CHANGELOG.md`, Chinese README, CI.

## 0.3.0

- Added the reasoning gate for unresolved questions in assistant reasoning.
- Narrowed verification to read-only tools and read-only run_code.

## 0.2.0

- Added ambiguity gate, `agents_memory`, and model-written index entries.

## 0.1.0

- Initial deterministic session index and compression guard.
