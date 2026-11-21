# Agents guard

## Behavior

dsh-agents-guard is a Host plugin. It registers a host-only session projection named agentsGuardMemory at stateVersion 4 and a separate agentsGuardReasoning projection at stateVersion 4. The memory projection folds committed session events into bounded lists:

- user requirements and corrections, from user/message events whose source kind is user;
- candidate decisions and open items, from assistant/message text with deterministic keyword checks;
- tool failures, from tool/result errors, using the matching tool/call name;
- changed files, from write or edit tool results;
- model-written entries, from successful agents_memory tool results;
- compression counts, from compress tool calls;
- per-question reasoning state, from assistant/message and assistant/attempt reasoning blocks; each question has an ID and a resolved/asked state.

At turn/start the plugin builds a compact memory card and injects it through agent.inject with source kind plugin:dsh-agents-guard. At turn/end and on user/message it updates `$DSH_HOME/agent-context/<sessionId>/AGENT_CONTEXT_INDEX.md`; it never writes the workspace-root file. The generated block is delimited by HTML comments; content outside the block is preserved.

## Model-written memory

The plugin registers agents_memory with action add and kind decision, verified, error, open, requirement, correction, or assumption. Required fields are kind and text. The text must be a distilled conclusion or requirement in the model's own words (at most `memoryTextMax`, default 600 characters); the tool rejects longer text and transcript-like multi-line copies. Optional field: evidence. Raw user messages stay searchable through agents_index (`userLog`, labelled `raw-user-message`), so memory is not a second copy of the transcript. The projection adds the entry and sets memoryRecordedSeq only after a successful tool result; a pending or failed call does not pollute the index or clear the record gate. The next card shows the entry under LLM 记录, and the Markdown index shows it under the same heading.

## Recall / record gates

When the latest user message looks like a recall/history request, session_search, session_event_search, session_event_trace, session_trace, session_event_read, and search_context are denied until agents_index has run for that user seq. The card and system prompt name agents_index first; decompress/search_context are the documented fallback.

When the latest user message states a requirement, correction, decision, or acceptance criterion, write/edit/pwsh/compress and mutating run_code are denied until a successful agents_memory result covers that user seq. Read-only tools and read-only run_code, including multiple read calls, are allowed without recording. In PTC the record call must be exactly one safe `run_code` call; the parser accepts a JSON object or an ordinary JavaScript object literal, including a `return await` prefix and a short multi-statement snippet with one safe call. A normal user question is not ambiguity and does not create this state.

## Task authorization

`agents_task` has four actions. `start` records a model-proposed goal, allowed path prefixes, and exclusions; the proposal is not user authorization. `status` reads the projected task. `confirm` requires the latest user message to be a confirmation and returns the active task; `close` closes it. The projection stores task and authorization fields in the memory state (v4), and the card shows the status. `taskGate` (default false) requires an active task for write/edit/pwsh/non-read-only run_code/plugin_manager mutations; path scope and exclusions are checked with normalized prefix matching. `agents_task`, read-only tools, agents_index, agents_memory, and agents_verify stay allowed. The confirmation and path checks are heuristics, not a security boundary.

## Evidence and change ledgers

`agents_evidence` records a structured claim: source (`file`, `command`, `message`, `observation`), mechanism, conditions, result, optional positive control, and `observed`/`contradicted` status. The host assigns `ev-<seq>` only after a successful result. `verified` is not accepted from the model; verification is a host/independent conclusion. `evidenceGate` requires a usable entry for `agents_memory` kind=verified/decision and rejects an unknown `ev-N` reference.

`agents_change` records a plan with target, direct/indirect impact, at least one invariant, and a verification plan (`chg-<seq>`); `apply`/`verify` update the projection, and `verify` requires at least one recorded passing check when `verificationGate` is on. `agents_check` attaches an assertion/command/expected/actual/evidence to a change and records pass/fail/pending (`chk-<seq>`); a check is model-stated, not a host test execution. `agents_recovery` records a baseline/rollback/verify entry (`rec-<seq>`) with its owning `changeId`; `recoveryGate` only accepts a baseline whose `changeId` matches the current planned change covering the target, and it does not create a backup. `impactGate` requires a planned change with an invariant covering the target before protected mutations.

`agents_index action=audit` reports counts and empty required sections and writes `indexAudit` to the projection; `indexGate` requires status=pass before compression. The pressure exemption runs before this gate. All six gates default false and are heuristic bookkeeping, not a security boundary.

## Context continuity

`agents_task` accepts an ordered `steps` list. After a completed step, `agents_handoff action=save` stores `step`, `next`, `preserve`, `discard`, and `risks`; this is the primary compression path. `continuityGate` (default true) requires a ready handoff below the context threshold, and `decideContinuity` denies compression when the handoff is missing, stale (a newer user message exists), or incomplete (for example no next step). At or above `compressPressureRatio` (0.8), the host projection is allowed as the emergency fallback; there is no separate 70% threshold.

`buildContinuity` renders a host-projected card: task/goal and scope, the active change plus invariants, checks, recovery baseline, open questions, recent requirements/decisions, changed files, and the model's step/next/preserve/discard/risks. Host-projected fields are deterministic; the handoff notes are model-distilled and are not independently verified. The card is injected on turn start and after compression, and the same protocol is placed in the system prompt and the one-time threshold reminder. `writeContinuity` writes the same capsule to `AGENT_CONTINUITY.md` (default on, never contains raw reasoning or a transcript).

Live overlays keep runtime consistency: `agents_task start/confirm/close` updates an in-process task immediately, and a successful `agents_handoff save` updates an in-process handoff immediately, so a same-program `close`+`write` cannot bypass `taskGate` and a same-program handoff is visible to `compress`. The projection remains the durable source; once it has newer data, the live overlay is replaced.
## Compression denial

The plugin registers a global tool guard. For compress, the guard reads the current session projection and the injection bookkeeping for that session. It denies when:

1. the projection is unavailable;
2. no card was injected in this session;
3. the injected card belongs to a different turn;
4. a user message arrived after the injected card.

The denial reason names the sequence numbers. It is a denial, not a reminder: the compress call does not run. `denyCompress` is fixed on. A session with no injected card is allowed only by the fixed internal `legacyCompressWithoutCard` fallback; it is not exposed in the settings page. A card that belongs to another turn or predates the latest user message is still denied unless the pressure exemption applies.

Before those checks, the guard reads the official `tokenMeter.contextPressure(session)` and compares `pressureTokens / contextWindow` with `compressPressureRatio` (default 0.8). When the ratio is at or above the threshold, compress is allowed immediately, even when the projection is unavailable, no card was injected, the card is stale, or the reasoning gate is open. This is the only escape hatch, and it applies only to compress: other mutating tools remain gated. The exemption is inactive before the first logged request or when tokenMeter has no `pressureTokens`/`contextWindow`; it never guesses context use from text length.

## No user-message ambiguity gate

A user question is treated as information, not as ambiguity. The guard does not scan user messages for alternatives, 随便/你决定, yes-or-no questions, or any other phrasing. Ambiguity is a semantic condition: the same request has multiple plausible interpretations that would change the implementation direction. The model may ask for clarification in that case, but the plugin does not infer it from punctuation or keywords, and it never blocks read-only operations for this reason.

## Reasoning gate

The gate reads assistant/message and assistant/attempt reasoning blocks only for a model-written guard summary. It does not scan or store the raw reasoning. The accepted form is one GUARD_SUMMARY JSON object with goal, decisions, uncertainties, and next; only its explicit uncertainties (at most four, each at most 300 characters) become open questions. A bare question mark, a planning phrase, or an ordinary sentence never creates a question. The summary is stored; the original reasoning is not.

Each summary uncertainty gets a stable ID (q-<eventSeq>-<index>). While any question is open, write, edit, pwsh, compress, and mutating run_code are denied. Read-only run_code is allowed, including multiple read calls; the classifier blocks code containing write/process/plugin mutation APIs. Direct read, glob, grep, and agents_verify are never blocked. The model can also emit GUARD_STATE for the independent risk gate: repeated reasoning without new evidence, an identical tool signature, a repeated completed operation, an explicit constraint conflict, or a self-reported loop/drift opens a risk. A risk denies mutating tools until a truthful GUARD_STATE clears it; read-only checks remain available. An optional one-shot LLM review is recorded as advisory, and riskReviewFailure=allow (default) prevents an unavailable review from self-locking the session. agents_verify is the host-side read-only verification tool: read_file, list_dir, or grep only; it accepts questionId or questionIds, validates which IDs are open, and one successful result resolves every listed ID (unknown IDs are returned in missingIds). Calling the official ask_user_question first, then ask_user, moves the latest open question to WAITING; the user reply resolves only the asked question. If neither ask tool is available, a normal-text question is accepted; the next user reply resolves it. A failed verification does not resolve anything. agents_memory records decisions and evidence but does not clear the gate. A successful agents_verify through run_code is resolved from the outer run_code tool/call/tool/result pair, because nested tool calls are not guaranteed to be replayed as projection events. Normal user questions, including answer-card messages beginning with 【回答 or containing →, are not treated as ambiguity. The plugin also injects a one-time user-role notice naming the open question IDs, so the model can correct course before the next mutation.

## Event points

- sessionProjections.register: agentsGuardMemory at stateVersion 4 and agentsGuardReasoning at stateVersion 4 (additive fields are optional; old reasoning state migrates and clears stale ambiguity risks instead of blocking a fresh session).
- session/event turn/start: inject the card and record turn plus last user sequence; refresh the live task/handoff overlay from the projection.
- session/event turn/end and user/message: queue one Markdown update and rewrite AGENT_CONTINUITY.md when a handoff exists; a user message makes the handoff stale.
- session/event assistant/message and assistant/attempt: parse GUARD_SUMMARY, create explicit uncertainty questions, update the risk state, inject one notice, and refresh the Markdown block.
- session/event tool/call and tool/result: record every question ID on the outer run_code call when its code is exactly agents_verify (questionId or questionIds); a successful tool/result resolves every listed question. A direct agents_verify call is handled the same way. The same pair captures agents_task, agents_handoff, agents_memory, and the six ledger tools; compress records compressedSeq on the continuity entry.
- tools.guard (when available): live settings sync (settings.describe), forced-compress pressure exemption (official tokenMeter), task gate, evidence gate, impact gate, recovery gate, verification gate, risk gate, reasoning gate, recall/record gates, continuity gate, then compress/index gates. If `tools.guard` is unavailable, the plugin still loads and registers the index/memory/task/ledger/handoff tools, logs a warning, and reports `toolsGuard: false`; gates are disabled.
- tools.register: agents_memory, agents_index (on-demand card/Markdown/counts/open questions/audit), agents_verify (fixed read_file/list_dir/grep only), agents_task (start/status/close/confirm, with steps), agents_handoff (save/status/render/clear), agents_evidence (add/list/get), agents_change (plan/status/apply/verify), agents_check (add/status/record), and agents_recovery (baseline/status/rollback/verify).
- systemPrompt.section: memory/priority/risk/continuity sections at orders 7000, 10001, 10002, and 10003.

## Compatibility

The plugin treats optional integrations as a class of missing capability rather than assuming the compression plugin is always installed. `sessionProjections` and `tools.register` are required; without them the plugin cannot provide the index. `tools.guard` is optional: the plugin loads and the index tools work, but gate enforcement is disabled and logged. A missing `compress` tool means the compression-only gates (`denyCompress`, `continuityGate`, `indexGate`) never run; ordinary writes are unaffected. A missing `tokenMeter` disables the 80% reminder and pressure exemption, so the user must call `agents_handoff save` at step boundaries; the plugin never estimates context from text length. A missing `settings` service falls back to the startup/plugin-row config; a missing client settings page leaves the Host tools unchanged. A missing `workspaceFiles` makes `agents_verify` fail explicitly and never falls back to node:fs; direct read/glob/grep stay available. A missing `llm` skips the advisory risk review and `riskReviewFailure=allow` prevents a self-lock. A different compression tool name is not intercepted. See docs/COMPATIBILITY.md for the matrix and the no-compression workflow.

`agents_guard_dev status` also reports `capabilities` for settings, tokenMeter, workspaceFiles, llm, and toolsGuard when developer mode is on.
## Safety and limits

The projection state is checkpointed by DSH and can refold from the session log. Injection bookkeeping is process-local, so after a restart the first turn injects a fresh card; an old session also gets a lazy card on its next session event. A session that has never injected a card may still compress only through the fixed internal `legacyCompressWithoutCard` fallback; it is not a settings-page switch. `denyCompress` and that fallback are fixed on. The pressure ratio comes from tokenMeter.contextPressure(); the plugin does not estimate context from text length or from a third-party projection. The plugin does not parse or rewrite the compress arguments; it gates on index coverage, not on a specific range. The Markdown writer uses the session working directory and preserves manual content outside the generated block. If two sessions share one working directory, the last writer wins; the generated block names the session id.

The live task and handoff overlays are process-local and exist only to make same-program tool sequences consistent before the projection commits; they are not a second durable state. A handoff is model-distilled text, not an independent audit, and the host capsule only guarantees the fields it projects. The continuity gate is a workflow guard, not a context-window estimator: the only pressure signal is the official tokenMeter reading at `compressPressureRatio`. There is no separate 70% threshold. Raw reasoning, command logs, and transcripts are never written to the continuity file.
Developer mode (`developerMode`, default false) is a testing escape hatch: the tool guard returns before any gate, including compression denial, recall, record, reasoning, and risk. It does not bypass DSH filesystem permissions, workspaceFiles path handling, or index writes. The settings page exposes the switch; it is not a production safety setting.

## Developer test harness

`agents_guard_dev` is available only when `developerMode` is true. It has four actions: `status` reads the live memory/reasoning projection summary and the active policy values; `self_test` builds fresh fixtures and runs 14 deterministic cases through the same decision functions as the live guard; `simulate` evaluates one named scenario (`reasoning`, `risk`, `recall`, `record`, `task`, `compress`, `memory`, and the continuity decision)  with `enforceGates` defaulting to true; `probe_write` creates one file under `.tmp/guard-dev/<session cwd>`, reads it back, and deletes it in a finally block. The harness never mutates a live projection, the Markdown index, or the reasoning-state file. It is not a security boundary: the tool rejects calls when developerMode is false, but developerMode itself remains a test-only bypass of all gates. `self_test` is deliberately read-only; `probe_write` is the only real filesystem mutation and is confined to a generated path.

Settings are read from the live settings service. The Host calls `ctx.get('settings').describe()` at the start of every guard, prefers that row value over the startup snapshot, and also refreshes on settings/document-updated, settings/changed, loader/volatile-update, app-boot/config-reload, and config/changed. A save from the settings page therefore changes the next guard call without a plugin reload. There is no second read-permission policy: agents_verify resolves paths through workspaceFiles and inherits the DSH session policy.

## Grouped settings and effective policy

The settings page has four feature groups: `workflowEnabled` (task/change management), `continuityEnabled` (context continuity), `reasoningEnabled` (reasoning checks), and `memoryEnabled` (memory/index maintenance). Each group has a master switch, an on/off/partial state, and default-collapsed advanced options; developer/diagnostics is separate. The master switch does not replace the child settings: `normalizeConfig()` preserves every raw child value, and `effectiveConfig()` computes `effective.child = groupEnabled && child` for runtime use. All guard decisions and runtime writes use the effective value, while the settings form reads the raw values so re-enabling a group restores the user's previous advanced choices.

A profile without the new group fields derives each group from its old children (any enabled child means the group is on). `settings.describe()` exposes a `user` layer; when it contains an explicit group field that value wins, otherwise the group is derived. This prevents a schema default from silently enabling a group the user never chose. Turning a group off pauses its gates and file writes only; it does not delete tasks, memory, the Markdown index, `AGENT_CONTINUITY.md`, or the reasoning-state file. Mixed child states show as partial. The `compressPressureRatio` threshold remains a compression safety escape even when the continuity group is off.

Reasoning summaries are the only reasoning content stored. The reasoning projection version 4 migration clears legacy questions and ambiguity risks; resolving the last open ambiguity question also clears its risk. The raw reasoning text and a stale risk from an older projection version are ignored by the gate.

Task scope is prefix-based and only applies when a tool argument names a file path; `pwsh` commands are gated by the active-task requirement but their internal paths are not parsed. The task gate is a workflow guard, not an OS sandbox.

Gate coverage also classifies known mutating tool names beyond the configured lists: apply_patch, terminal, create/update/delete/push/merge and similar. Unknown capabilities still require a host inventory and are not proven read-only.

There is no user-message ambiguity detector. A normal question is informational; the model should ask for clarification only when multiple interpretations would change the implementation direction. The reasoning gate handles unresolved questions in the model's own reasoning and never blocks direct read-only tools.

The question set is limited to explicit uncertainties in the model-written GUARD_SUMMARY; a missing summary cannot be recovered from raw reasoning, and the summary itself is model-authored, not an independent audit. The gate resolves a listed set of questions in one agents_verify call (questionIds), or the asked question through a user reply; ask_user_question (official first) or ask_user only moves the latest question to WAITING. It cannot prove that verification semantically answered the question; it binds the successful host read to the selected questionId. The run_code classifier is a string/API pattern match, not a complete sandbox: read-only multi-call code is allowed, while code containing write/process/plugin mutation APIs is denied. Obfuscated bypasses remain possible and should not be treated as a security boundary.

agents_memory writes a runtime entry and calls the Markdown writer immediately. The runtime map is process-local; the Markdown index keeps the entry after restart, but the card does not reload it automatically.

Each agents_memory entry is host-classified as model-inferred or assumption. The tool no longer accepts model-supplied source or authority, so the model cannot claim user-confirmed or tested. User messages are indexed as user-stated. The label is provenance, not independent verification.
