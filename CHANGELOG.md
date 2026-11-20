# Changelog

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
