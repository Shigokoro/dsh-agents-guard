# Changelog

## 0.8.6

- Fix the handoff persistence chain behind `continuityGate requires a current agents_handoff before compression (stale; missing: next)`: a save could report `ready` while the gate read an older projection, because the live value was overwritten by `user/message` bookkeeping, a `null` live value shadowed the projected one, and a batched `run_code` save was dropped when the program also called a non-ledger tool. Continuity now resolves through `pickHandoff([live, projected, persisted])`, the user-message handler no longer writes continuity, and `embeddedHandoffCall` recovers a save from any program that mixes `agents_handoff` with other tools.
- Persist continuity next to the capsule as `AGENT_CONTINUITY.json` (`<session cwd>`), read back by mtime/size, so a plugin reload or a fresh projection cannot lose the saved handoff. `agents_handoff` now returns `build`, `source` (`live|cleared|projected|persisted|none`) and `projectedStatus`, so a live failure can name the layer that supplied the value.
- An incomplete save (no `next`) and a `clear` never replace an existing valid handoff with a newer but useless entry; `pickHandoff` prefers valid entries, then the one covering the latest user message.
- Bump the `agentsGuardMemory` projection `stateVersion` to 5 so sessions rebuild state written by the previous reducer.
- Default `compressPressureRatio` lowered from 0.8 to 0.75 (config default, settings schema, prompt text); the emergency fallback now fires at 75% of the context window.
- Add regressions: default and out-of-range ratio are 0.75; 75000/100000 allows while 74999/100000 denies; a mixed `agents_index` + `agents_handoff` program reaches `ready`; an incomplete batched save keeps the previous handoff; `pickHandoff`/`handoffHasNext` ordering; `GUARD_BUILD` matches `package.json`.
- Version bumped to 0.8.6.
## 0.8.5

- Project `agents_handoff` from multi-call `run_code` programs: `embeddedLedgerCalls` now keeps handoff entries (previously only change/check/recovery were projected), and the tool/result reducer applies `handoffEntryFrom` for them. A batched "save handoff + audit + status" program no longer leaves the compress gate reading a stale capsule with `continuityGate requires a current agents_handoff ... missing: next`.
- Advance the index-card injection mark by user sequence: `advanceInjectedMark` keeps seq monotonic even when the turn value is unknown or behind, and `injectCard` is retried on non-turn events while `cardMarkCovers` reports the latest user message is not covered. This fixes `the index card covers user seq N but the latest user message is seq M`.
- Add regressions: multi-call handoff reaches `continuityStatus === 'ready'`; the mark advances for a newer seq, refuses a lower seq, and `cardMarkCovers` reports coverage.
- Version bumped to 0.8.5.

## 0.8.4

- Fix compression denied by turn bookkeeping: `decideCompress` compared the injected card's turn with `turnBoundaryOf().lastTurn`, but the two values come from different sources, so a card injected on turn 1 blocked compression on turn 3 with `the session index card belongs to turn 1, current turn is 3` and the turn could not recover. The turn comparison is removed; the card's recorded user sequence remains the staleness check.
- Fix audit status starving compression: `agents_index action=audit` returned `pass` only when all four required groups were non-empty, and the documented flow (`agents_memory` then `agents_handoff`) never fills `changedFiles`/`checks` or `decisions`/`openItems`. A read-only session therefore could not reach `pass`. `auditIndex` now treats `requirements`/`userLog` as critical (empty -> `incomplete`) and the other groups as advisory (empty -> `warn`); `indexGate` accepts `pass` or `warn`, and the denial reason names the missing sections.
- Harden injection bookkeeping: `injectCard` now advances the marker when an injection attempt starts, including a missing `agent`/`agent.inject` or a pending `agent.inject` promise, and logs each case; a failure keeps the marker and clears the card hash so the next turn retries. Previously a missing agent returned silently and left the marker frozen.
- Log every missing pressure source once: `readContextPressure` now warns when `ctx.get('tokenMeter')`, `contextPressure`, or a positive `contentWindow`/`pressureTokens` pair is unavailable, instead of returning null silently. The 80% exemption still cannot fire without a real meter; the log now says why.
- Add core and guard regressions: stale-turn compression is allowed, a stale user sequence is still denied, `indexGate` accepts `warn` and rejects `incomplete`, and `auditIndex` classifies each group. `npm run check` and `npm test` pass (`core`, `guard`, `client`).
- Project every embedded ledger call: `embeddedToolCalls` now returns all safe `run_code` calls, and `reduceEvent` projects each `agents_change`/`agents_check`/`agents_recovery` call in a multi-call program instead of dropping all but the last. `embeddedToolCall` keeps its single-call contract for the recall/record checks, and `isSafeGateRunCode` still requires every detected call to be safe.
- Restore settings-page contrast: section and permission panels use `bg-layer-2`, secondary text uses `label-secondary`, the group switch uses `brand-primary`, and the primary button uses `button-primary-fill`/`label-primary-foreground` with a neutral disabled fill and `label-tertiary` text instead of `opacity`.
- Version bumped to 0.8.4.

## 0.8.3

- Fix settings hot-apply: `normalizeConfig` previously overlaid the settings user layer only for the four group switches, so saving a child gate such as `taskGate`, `recallGate`, or `developerMode` wrote the user layer while the running Guard kept the old profile value. The whole explicit user layer is now overlaid before boolean normalization and group derivation; group precedence is unchanged.
- `readSettingsValues` now returns the live settings row even when its value layer is absent, so a user-only save reaches `syncConfig`. The client `readDraft` merges the value and user layers; a user-only configuration is no longer rendered as unavailable, and the hints say the next guarded call reads the new values.
- Live verification on the running Host: setting `taskGate=true` through the live settings row made the very next write fail with `target is outside the active task scope` and created no file; writing `false` immediately allowed the next write. This proves child values from the settings user layer take effect without a plugin reload. An actual authenticated settings-page click remains unverified.
- Add a core regression for an explicit user child override. `npm run check` and `npm test` pass (`core`, `guard`, `client`).

## 0.8.2

- Fix `agents_recovery action=baseline`: `changeId` is now required and must name an existing planned/applied change; an unbound baseline is rejected instead of silently returned. The recovery gate already required a matching change, so this closes the gap between tool success and gate usability.
- Fix the `agents_memory` success note: when `writeIndex` is off (including the memory group being off), the note says the Markdown index was not updated instead of claiming it was written. The runtime memory card still receives the entry.
- Fix recall-first recognition for read-only multi-statement `run_code`: one embedded safe `agents_index` call now sets `agentsIndexSeq`, while code containing a write or process/plugin mutation does not. This keeps the single-safe-call security check for mutation paths.
- Document the existing `agents_check` projection boundary: a check is projected only when `add` is exactly one safe `run_code` call; calling `add` and `status` in the same program does not project the add. The ledger semantics are unchanged.
- Add core and guard regressions for recovery binding, memory-off wording, embedded recall recognition, and the mutating-code negative case. `npm run check` and `npm test` pass.
- Reloaded the bundle after the 0.8.2 bump; a live `agents_recovery baseline` without `changeId` was rejected, and a baseline bound to `chg-29506` succeeded.
- Live-verified the memory-off note with a temporary `memoryEnabled=false` profile: `agents_memory` reported that `AGENT_CONTEXT_INDEX.md` was not updated. The profile was restored byte-for-byte and the temporary directory was removed.

## 0.8.1

- Reorganize the settings page into four feature groups: workflow/change management (`workflowEnabled`), context continuity (`continuityEnabled`), reasoning checks (`reasoningEnabled`), and memory/index maintenance (`memoryEnabled`). Each group has a master switch, an on/off/partial state, and default-collapsed advanced options; developer/diagnostics stays separate and collapsed.
- Preserve every existing child setting and add `effectiveConfig()`: runtime behavior is `groupEnabled && child`, while the raw child values remain available for the settings form and for re-enabling a group without losing previous choices. Guard decisions, tool reads, card/continuity rendering, index/state writes, and diagnostics use the effective config.
- Migrate profiles without the new group fields by deriving each group from its old children; an explicit settings `user` layer wins, so schema defaults cannot silently enable a group the user never chose. Mixed child states display as partial, and turning a group off pauses it without deleting task/memory/index/continuity/reasoning data.
- Add grouped settings rendering plus a real client render test covering the four groups, developer section, partial/off state, empty-profile defaults, and advanced numeric fields. Add core tests for group derivation, explicit-user precedence, effective AND behavior, numeric preservation, non-mutation of raw settings, and runtime decisions honoring the group switch.
- Fix core and client explicit-user precedence (an explicit user group choice wins even when the value layer still carries the schema default), and wire `maxEvidence` into the evidence projection so the advanced numeric setting actually applies.
- Version bumped to 0.8.1. The settings grouping/effective config is implemented and tested; the live `settings.describe()` user-layer migration was checked on the current profile (no group fields, effective groups all on), while real DSH settings-page clicking and live per-group toggling remain in the unverified list.

## 0.8.0

- Add context-continuity support. `agents_task` accepts an ordered `steps` plan; after each completed step, `agents_handoff action=save` records `step`, `next`, `preserve`, `discard`, and `risks`. The step-boundary handoff is the primary path; compression at the boundary keeps the task/goal, scope, active change and invariants, checks, recovery baseline, open questions, and next step.
- Add `continuityGate` (default true), `continuityMaxChars` (default 1600, range 300-4000), `continuityFile` (default `AGENT_CONTINUITY.md`), and `writeContinuity` (default true). A missing, stale (newer user message), or incomplete handoff denies compression below the context threshold; at or above the existing `compressPressureRatio` (0.8) the host projection is allowed as the emergency fallback. There is no separate 70% threshold.
- The continuity card is injected on turn start and after compression, with host-projected fields and model-distilled notes clearly separated. The protocol is injected in the system prompt, the card, and the one-time threshold reminder rather than only in documentation.
- Add live task and handoff overlays so `agents_task close` followed by a write in the same `run_code` program cannot bypass `taskGate`, and a handoff saved in the same program is visible to `compress` before the projection catches up. Both overlays are removed when the projection has newer data.
- Harden `latestChange` path matching for relative/absolute paths, `..`, and parent-directory coverage; a verified newest change no longer falls back to an older planned change. `decideRecovery` rejects a target with no planned/applied change instead of accepting an unrelated baseline.
- Add continuity, live-overlay, task path/lifecycle, and recovery-binding regressions. The settings page exposes `continuityGate`, `writeContinuity`, and `continuityMaxChars`; `cordis.patch.yml` carries the defaults. `agents_guard_dev self_test` grows to 14 cases with a continuity scenario.
- Add a compatibility matrix (`docs/COMPATIBILITY.md`) and graceful degradation for optional dependencies. With no context-compression plugin, compression-only gates never run and the index/memory/task/ledger/handoff tools remain available; without `tokenMeter`, the 80% reminder and pressure exemption are inactive and step-boundary handoffs are manual. `tools.guard` is optional (index tools load, gates disabled and logged), `agents_guard_dev status` reports settings/tokenMeter/workspaceFiles/llm/toolsGuard capabilities, and a regression confirms continuity/index gates never affect ordinary writes.

## 0.7.1


- Fix `recoveryGate` binding: a recorded baseline now only authorizes the specific planned change (`changeId`) that covers the target. A baseline from another change no longer passes the gate. The guard passes `toolArgs` into `decideRecovery` so the target is resolved correctly, and a regression test covers the mismatch.
- Document the binding rule in README, README.zh, and DETAIL.

## 0.7.0

- Add the six review modules as opt-in gates, all default false so existing sessions keep their behavior: task authorization (`taskGate`), structured evidence (`evidenceGate`), impact/invariants (`impactGate`), verification (`verificationGate`), recovery baseline (`recoveryGate`), and index integrity (`indexGate`).
- Add `agents_evidence`: add/list/get a structured claim with source, mechanism, conditions, result, positive control, and observed/contradicted status. `verified` is rejected from the model; host-derived verification remains separate.
- Add `agents_change`: plan/status/apply/verify. A plan records the target, direct/indirect impact, at least one explicit invariant, and the verification plan; `impactGate` requires that plan before protected mutations.
- Add `agents_check`: add/status/record a check tied to a change. `verificationGate` requires at least one recorded pass before `agents_change action=verify`.
- Add `agents_recovery`: baseline/status/rollback/verify. `recoveryGate` requires a recorded baseline bound to the current change before high-impact writes; baseline is a ledger entry, not an automatic backup.
- Add `agents_index action=audit` and `indexGate`: compression requires a recent audit with status pass. Audit reports which required sections are empty.
- Projection state v4 now carries task, authorization, evidence, changes, checks, recovery, and indexAudit. The settings page exposes all six gate toggles.
- Harden projection persistence: ledger entries include a `text` field, so `addBounded` no longer silently drops changes/checks/recovery. Add projection tests for all ledgers and the audit result.
- `self_test` grows to 13 deterministic cases, including impact/recovery/verification/index fail-closed behavior.

## 0.6.1

- Add developer-mode test harness `agents_guard_dev` (requires `developerMode=true`): `status` reads the live projection/config summary, `self_test` runs 11 deterministic gate cases, `simulate` evaluates a named scenario without touching real state, and `probe_write` verifies a real temporary write (created under `.tmp/guard-dev` and deleted immediately). The harness never mutates a session projection, the Markdown index, or the reasoning-state file; `probe_write` is the only mutation and is confined to a generated test file.
- Fix the settings-page `maxReasoningQuestions` regression: `readDraft()` omitted the field, so saving wrote `null`. It now defaults to 8, validates 1–64, and the profile value was repaired. Add client and core regression checks.
- Add task authorization (state v4): `agents_task start` records a model proposal, `confirm` activates it only when the latest user message is a confirmation, and `close` closes it. `taskGate` (default false, settings-page toggle) requires an active task and a matching path scope for write/edit/pwsh/non-read-only run_code/plugin_manager; proposals are never treated as authorization. The card shows the task status. The check is heuristic, not a security boundary.
- Recognize PTC calls inside run_code whether they use JSON or an ordinary JavaScript object literal, including a `return await` prefix and calls embedded in short multi-statement snippets. This fixes task/memory calls that previously executed but never updated the projection. `self_test` grows to 12 cases with a task scenario.

## 0.6.0

- Add an independent reasoning-risk gate on top of the question gate: repeated reasoning without new evidence, repeated tool signatures, a completed operation being repeated, explicit constraint conflicts, and self-reported loop/drift can open a risk. When a risk is open, mutating tools are denied until the model emits a truthful `GUARD_STATE`; read-only checks and `agents_verify` remain available. An optional independent LLM review runs once per risk and can clear or confirm it; failure to obtain a review is configurable (`riskReviewFailure`, default `allow`) so the gate cannot self-lock.
- Store only a distilled `GUARD_SUMMARY` (`goal`, `decisions`, `uncertainties`, `next`) from reasoning. Raw reasoning is never persisted, and only the summary's explicit uncertainties can become open questions. This replaces the old keyword scan of the full reasoning stream.
- Add two-layer operation memory: `operationKeywords` keeps a small long-lived keyword summary with counts, while `recentMemory` keeps detailed recent operations/thoughts with a configurable cap. The card shows keywords first and then the most recent details.
- Add a reasoning projection state migration (stateVersion 4); old ambiguity risks and old reasoning questions are cleared instead of blocking a fresh session. Resolving the last ambiguity question also clears the associated risk.
- Make settings take effect without a reload: the Host reads the live `settings.describe()` value on every guard call and refreshes on `settings/changed`, `loader/volatile-update`, and `app-boot/config-reload`; `developerMode` toggled in the settings page changes the next guard call.
- Add the settings-page controls for the new policies: `developerMode`, `recallGate`, `recordGate`, `reasoningRiskGate`, `semanticReview`, `writeReasoningState`, `loopThreshold`, `toolRepeatThreshold`, `memoryTextMax`, `recentMemoryMax`, and `maxReasoningQuestions`.
- Fix the client duplicate-factory crash by ignoring only an already-registered bundle factory; fix `agents_verify` to use the `workspaceFiles.readBytes()` payload; resolve questions from a successful `agents_verify` even when the outer call has no `callId`.

## 0.5.8

- Add `agents_verify` batch resolution: pass `questionIds` to resolve a whole question list with one read-only verification; the outer `run_code` projection carries every ID, and one success clears all listed questions. Unknown IDs are returned in `missingIds`.
- Add developer mode (`developerMode`, default false): when enabled, all guard gates are bypassed for regression testing; it does not bypass DSH permissions or index maintenance. The settings page exposes the toggle.
- Narrow the reasoning-question detector to explicit questions: a bare planning phrase or a normal English sentence no longer becomes a gate; legacy non-question entries are ignored by the gate.

## 0.5.7

- Remove the user-message ambiguity gate. A normal question is no longer classified as ambiguity; the plugin only tracks unresolved questions in the model's own reasoning. Direct read-only tools are never blocked by that gate.
- Replace the one-call `run_code` allowlist with mutation-aware classification: multiple read-only calls are allowed, while code containing `tools.write`/`edit`/`pwsh`/`terminal`/`plugin_manager`, fs write/rename/delete/mkdir, or child-process APIs remains blocked.
- Add `memoryTextMax` (default 600, range 100–2000) and apply it to `agents_memory`; expose it on the settings page together with `recallGate` and `recordGate`, and remove the ambiguity controls.
- Add regression tests for user questions not gating writes, multi-statement read-only `run_code`, mutating `run_code`, and the configurable memory limit.

## 0.5.6

- Add a recall-first gate: when a user message asks about earlier work, requirements, decisions, corrections, or context, `session_search` and the other fallback search tools are denied until `agents_index` has run for this turn. The card and system prompt name `agents_index` as the first recall tool.
- Add a record-first gate: when a user message states a requirement, correction, decision, or acceptance criterion, write/edit/pwsh/compress and non-read-only `run_code` are denied until `agents_memory` records it. Ambiguity must be resolved first; `agents_memory` is denied while the ambiguity gate is open.
- `agents_memory` now accepts only a distilled conclusion or requirement in the model's own words (<=600 characters). It rejects longer text and transcript-like multi-line copies; raw user messages stay searchable through `agents_index` (`userLog`) and are labelled `raw-user-message` in search results.
- The memory card distinguishes distilled LLM records from raw user-message summaries, and the compression denial messages tell the model to record a distilled memory before retrying.
- Only a successful `agents_memory` result clears the record gate; a pending call or a failed call (for example a raw-text rejection) does not. The denial text now shows the required JSON single-call form, because JavaScript object literals with unquoted keys are rejected by the safe-call parser.
- Add unit tests for the recall/record gates, ambiguity-before-record ordering, the distilled-memory limit, and the new card protocol.

## 0.5.5

- Clarification precedence is official `ask_user_question` first, then Deep PTC `ask_user`, then a normal text question. The guard no longer treats `ask_user` as the only ask path; the next non-ambiguous user message still clears the gate.
- Treat rhetorical diagnostics such as "怎么还是……？" as questions, not as strong ambiguity; add a regression test for the exact phrasing.
- Add a DSH client settings page. The Settings section shows read permission as read-only (DSH owns it) and edits the common Guard policies through the official configuration form. The same controls are available in the plugin row configuration page.
- Add a client entry (dsh.client, ./client export) without importing client UI primitives or adding runtime dependencies.
- Remove the compression-denial and legacy no-card switches from the settings page. Normal old sessions get a lazy index card. `denyCompress` and the no-card fallback are fixed internal invariants (always on), not user-facing policies.
- Document that agents_verify reads through the DSH workspaceFiles service, not ctx.fs.

## 0.5.4

- Remove the guard's own read-path policy from agents_verify. read_file, list_dir, and grep now resolve, stat, read, and list through the DSH `workspaceFiles` service, so DSH owns path mapping, symlinks, and permission handling. There is no separate workspace/full setting in the guard.
- If `workspaceFiles` is unavailable, agents_verify fails instead of falling back to direct node:fs reads.
- Add guard tests that require reads to go through workspaceFiles and that a missing file service is rejected.

## 0.5.3

- Move the generated index to the session-level contract path `$DSH_HOME/agent-context/<sessionId>/AGENT_CONTEXT_INDEX.md`; do not write `AGENT_CONTEXT_INDEX.md` in the workspace root. This follows the user's 2026-10-12 session-index rule in `~/.dsh/STRUCTURE.md`.
- Load persisted LLM entries from the generated index block when the index tool runs, so entries survive a plugin reload even when the projection state is reset. Add `parseIndexMemory`.

## 0.5.2

- Capture a single inner `agents_memory` call made through `run_code` in the outer tool/call record. The projection now persists the entry, so it survives a plugin reload instead of disappearing with the transient runtime store.
- Add a JSON-persistence test for that path.

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
