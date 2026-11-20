# Changelog

## 0.5.1

- Re-inject the index card after a compression epoch (`state.compressions` changes) even when the card text is unchanged. Previously the `lastCardHash` short-circuit could skip the card after compression removed it from the live context, allowing a later compress without a current card.
- Add a guard integration test for first injection, unchanged epoch suppression, and forced re-injection after a compression.

## 0.5.0

- Track reasoning questions per ID instead of a single reasoningSeq/ClarifiedSeq pair. Multiple open questions do not clear each other.
- Add agents_verify: a host-side read-only tool limited to read_file, list_dir, and grep. It validates that questionId is currently open; one successful result resolves only that ID.
- Add agents_index: read the session index on demand (compact card, generated Markdown, counts, open questions) without opening AGENT_CONTEXT_INDEX.md manually.
- Replace the blanket run_code denial with a targeted capability allowlist: exactly one trusted safe call with JSON arguments is allowed (read, glob, grep, web_search, web_fetch, session read tools, agents_index, agents_verify, agents_memory, ask_user). Arbitrary JavaScript, multiple statements, and mutating calls stay blocked. This keeps read/verify/ask reachable while a reasoning question is open.
- Resolve an agents_verify call from the outer run_code tool/call and tool/result pair. Nested tool calls are not guaranteed to be replayed as projection events, so relying on them left the gate open after a successful verification.
- ask_user also has a strict exact-call gateway; it moves the latest open question to WAITING, and a user reply resolves only that question. agents_memory never clears the gate.
- Guard injection marks against a stale async result overwriting a newer turn/card mark.
- Keep projection stateVersion 3; legacy reasoningSeq/ClarifiedSeq sessions synthesize one legacy question.
- Update the English/Chinese README, DETAIL, and the global AGENTS.md wording for per-question verification, agents_index, and the targeted run_code allowlist.

## 0.4.7

- Add a forced-compress exemption based on the official `tokenMeter.contextPressure()`: when `pressureTokens / contextWindow` reaches `compressPressureRatio` (default 0.8), compress is allowed even without a current index card or while the ambiguity/reasoning gates are open. The exemption applies only to compress.
- Add `compressPressureRatio` config with normalization (greater than 0, at most 1).
- Cover exact, below-threshold, custom-threshold, and missing-context-window cases in the unit tests.
- Pass `legacyCompressWithoutCard` and `compressPressureRatio` through the guard's `decideCompress` call. Before this the call omitted both: the legacy no-card fallback never activated, and `decideCompress` ignored a custom threshold.

## 0.4.4

- Keep projection stateVersion at 3 so older sessions refold instead of resetting to an empty state; new WAITING/authority fields are optional and default safely.
- Legacy sessions lazily inject the guard card on the next event.

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
