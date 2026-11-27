# dsh-agents-guard

A DSH bundle that maintains a session index, accepts model-written memory entries, and blocks compression or mutating tools while a reasoning question is unresolved. It includes a Host entry and a small web settings page.

> Verification status (0.8.5): **not fully verified**. See [docs/UNVERIFIED.md](docs/UNVERIFIED.md) for the explicit list of verified and unverified behavior; absence from that list is not a guarantee.

## What it does

- Folds user messages, candidate decisions, open items, tool failures, and changed files from the committed session log with a host-only session projection.
- Injects a compact memory card at the start of each turn, labelled as plugin-maintained history rather than a new user instruction.
- Updates `$DSH_HOME/agent-context/<sessionId>/AGENT_CONTEXT_INDEX.md`, preserving hand-written content outside the generated block. It never writes `AGENT_CONTEXT_INDEX.md` in the workspace root.
- Registers agents_index for on-demand index retrieval: the compact card, the generated Markdown block, counts, and the current open reasoning questions, without opening the file by hand.
- Registers agents_memory so the model can record a distilled conclusion, requirement, open item, error, or assumption. It accepts at most `memoryTextMax` characters (default 600) in the model's own words and rejects transcript-like copies; raw user messages remain searchable through agents_index (`userLog`, labelled `raw-user-message`) instead of being duplicated as memory. The host sets source=model and authority=model-inferred (or assumption); the model cannot claim user-confirmed or tested. A successful tool result adds the entry to the next card and to the Markdown index. User messages are indexed as user-stated; decisions and verified facts should still cite evidence.
- Adds recall-first and record-first guards. A history question must call agents_index before session_search or another fallback search; session_search is denied until the index was queried. A new requirement, correction, decision, or acceptance criterion must be recorded with agents_memory before write/edit/pwsh/compress or a mutating run_code. In PTC, the record call must be exactly one agents_memory call; both a JSON object and an ordinary JavaScript object literal are recognized by the safe-call parser. Read-only run_code, including multiple read calls, is allowed without prior recording and does not count as ambiguity.
- Adds structured evidence (`agents_evidence`, `evidenceGate` default false): a claim records source, mechanism, conditions, result, a positive control, and observed/contradicted status; the model cannot claim `verified`. Verified/decision memory can be required to cite an existing evidence ID.
- Adds impact/invariants (`agents_change`, `impactGate` default false): a plan records target, direct/indirect impact, at least one explicit invariant, and the verification plan before protected mutations.
- Adds verification (`agents_check`, `verificationGate` default false): a check is tied to a change and must be recorded as pass before the change can be marked verified.
- Adds recovery (`agents_recovery`, `recoveryGate` default false): a high-impact write requires a recorded baseline bound to that change (`changeId`); a baseline for another change does not cover it, and this is a ledger entry, not an automatic backup.
- Adds index integrity (`agents_index action=audit`, `indexGate` default false): compression requires an audit with status pass or warn; an `incomplete` audit names the missing required sections. Empty advisory sections only warn, so a session that has not written files yet can still compress.
- Adds a task-authorization gate (`taskGate`, default false). `agents_task start` records a model-proposed goal, allowed path prefixes, and exclusions; a proposal is not user authorization. `confirm` succeeds only when the latest user message is a confirmation; `close` closes the task. When enabled, write/edit/pwsh/run_code and plugin-manager mutations require an active task, and out-of-scope or excluded paths are denied. The card shows the current task status; developer mode still bypasses it. This is a heuristic scope check, not a security boundary.
- Adds context continuity (`continuityGate`, default true). A multi-step task records an ordered `steps` list and calls `agents_handoff save` after each completed step (step/next/preserve/discard/risks). Below the 80% context threshold, compression without a ready handoff is denied; at or above the existing `compressPressureRatio` (0.8) the host projection is allowed as a fallback. There is no separate 70% threshold. The continuity card and `AGENT_CONTINUITY.md` distinguish host-projected state from model-distilled notes; after compression, resume from the card and do not redo completed operations.
- Works without a context-compression plugin. The compression-only gates (`denyCompress`, `continuityGate`, `indexGate`) do not run when no `compress` tool exists; index, memory, task, evidence, recovery, and handoff tools remain available. Without `tokenMeter`, there is no 80% reminder or pressure exemption, so call `agents_handoff save` at step boundaries manually. Other compression tools with different names are not intercepted.
- Registers a tool guard for compress. `denyCompress` is fixed on and cannot be switched off. The guard denies the call when the card was not injected for the current turn, or when the latest user message arrived after the injected card. A session with no card at all is allowed only by the fixed internal fallback (`legacyCompressWithoutCard`, always true); it is not a settings-page switch. Exception: when the official `tokenMeter.contextPressure()` reports `pressureTokens / contextWindow` at or above `compressPressureRatio` (default 0.8), compress is allowed even if the card is stale or the reasoning gate is open.
- Does not treat a user question as ambiguity. A question is only a request for information; ambiguity means the same request has multiple plausible interpretations that would change the implementation direction. In that case, ask before acting. The reasoning gate below covers unresolved questions in the model's own reasoning; it never blocks direct read-only tools.
- Registers a reasoning gate. Each unresolved question is tracked with its own ID. While any question is open, write, edit, pwsh, compress, and mutating run_code are denied. Read-only run_code is allowed, including multiple read calls; a call is treated as mutating when it contains tools.write/edit/pwsh/terminal/plugin_manager, fs write/rename/delete/mkdir, child_process/spawn/exec, or similar mutation APIs. Direct read, glob, grep, and agents_verify are never blocked. agents_verify is a host-side read-only tool limited to read_file, list_dir, and grep; all reads go through the DSH `workspaceFiles` service, so DSH owns path, symlink, and permission handling. The guard has no separate read-scope setting. Pass one `questionId` or a `questionIds` list; one successful read resolves every listed ID, and unknown IDs are returned in `missingIds`. ask_user_question (official first) or ask_user moves the question to WAITING but does not clear it; a user reply resolves only the asked question. agents_memory records evidence but does not clear the gate.
- Developer mode: `developerMode` (default false) bypasses all guard gates for regression testing. It does not bypass DSH permissions, path handling, or index maintenance. The settings page exposes the toggle; leave it off for normal use.
- Adds an independent reasoning-risk gate. Repeated reasoning without new evidence, repeated tool signatures, repeated completed operations, explicit constraint conflicts, and a self-reported loop or drift can open a risk. Mutating tools are denied until a truthful `GUARD_STATE` arrives; read-only checks and `agents_verify` stay available. An optional one-shot LLM review is advisory, and a failed review can be configured to allow rather than self-lock.
- Stores only the model-written `GUARD_SUMMARY` (goal, decisions, uncertainties, next); raw reasoning is never persisted, and only summary uncertainties can become open questions. The risk state has its own projection version, and resolving the last ambiguity question clears the associated risk.
- Settings are live: saving in the settings page changes the next guard call; no reload is required. The page is organized into four master groups (`workflowEnabled`, `continuityEnabled`, `reasoningEnabled`, `memoryEnabled`) with default-collapsed advanced options; developer/diagnostics is separate. A group off pauses its children without deleting child settings or accumulated data, and an old profile without group fields derives each group from its children.
- Developer mode exposes `agents_guard_dev` for complete gate testing: `status`, `self_test` (14 deterministic cases, including task, evidence, impact, verification, recovery, index, and continuity gates), `simulate` for one scenario including `task`, and a confined `probe_write` that creates and deletes a file under `.tmp/guard-dev`. The harness does not mutate live projections, the Markdown index, or the reasoning-state file.
- Redacts GitHub PATs, classic tokens, and Bearer tokens before storing index entries and rendering cards or agents_memory output.

## Install

Add this directory as a local DSH bundle (link or package) and enable the `agents-guard` entry. The bundle is host-only and has no runtime dependencies.

## Why this exists

AGENTS.md requires a persistent session index, forbids treating a compression reminder as a command, and requires asking when a request has multiple interpretations that would change the result. A model can still compress before writing the index, or choose an interpretation and proceed. This plugin makes both failures blocking instead of advisory.

## Settings page

The DSH Settings section **Agents Guard** shows the read permission as read-only: DSH owns path, symlink, and permission handling, and Guard has no second read policy. The same page edits the common Guard policies through the official plugin configuration form. The plugin row configuration page provides the same controls.

The page shows four default feature groups — task/change management, context continuity, reasoning checks, and memory/index maintenance — with an on/off/partial state. Advanced options inside each group remain editable when the group is off and preserve their values. Developer/diagnostics is a separate collapsed area. Compression denial and the legacy no-card fallback remain fixed internal invariants.

## Configuration

- enabled: default true. Set false to leave the plugin loaded but inactive.
- developerMode: default false. Bypass all guard gates for testing and expose `agents_guard_dev`; it does not bypass DSH permissions or index maintenance. Leave it off in normal use.
- workflowEnabled: default false. Master switch for taskGate, evidenceGate, impactGate, verificationGate, and recoveryGate. The child settings remain independent; an old profile without this field derives the group from its children.
- continuityEnabled: default true. Master switch for continuityGate and writeContinuity; numeric continuity settings remain available.
- reasoningEnabled: default true. Master switch for reasoningGate, reasoningRiskGate, semanticReview, and writeReasoningState; numeric reasoning settings remain available.
- memoryEnabled: default true. Master switch for recallGate, recordGate, indexGate, and writeIndex; numeric memory/index settings remain available.
- compressPressureRatio: default 0.8. When official `tokenMeter.contextPressure()` reports at least this fraction of the route context window, compress is forced through all guard checks. The value must be greater than 0 and at most 1.
- legacyCompressWithoutCard: internal compatibility setting, fixed true. It allows a session that has never injected a card when the plugin loads mid-turn; it is not shown on the settings page.
- writeIndex: default true. Set false to skip the Markdown file.
- indexFileName: default AGENT_CONTEXT_INDEX.md.
- indexRoot: default `$DSH_HOME/agent-context`; the file is under `<indexRoot>/<sessionId>/`.
- maxCardChars: default 4200.
- maxRequirements: default 12.
- maxDecisions: default 6.
- maxOpenItems: default 6.
- maxFailures: default 6.
- maxChangedFiles: default 10.
- maxLlmEntries: default 40.
- memoryTextMax: default 600; range 100–2000. Maximum length of one distilled agents_memory entry.
- recallGate: default true. Deny fallback session search until agents_index has run for the current user message.
- recordGate: default true. Deny mutation and compression until agents_memory has recorded the latest requirement, correction, decision, or acceptance criterion. Read-only tools and read-only run_code stay allowed.
- evidenceGate: default false. Require usable evidence for `agents_memory` kind=verified/decision; a cited `ev-N` must exist in the session ledger.
- impactGate: default false. Require a planned `agents_change` with direct/indirect impact and at least one invariant before write/edit/pwsh/non-read-only run_code/plugin_manager. `impactGateTools` lists the guarded tools.
- verificationGate: default false. Require at least one recorded `pass` check for a change before `agents_change action=verify`.
- recoveryGate: default false. Require a recorded `agents_recovery` baseline bound to the current `changeId` before high-impact writes. A baseline from another change does not authorize the write; the baseline is user/model-provided text, not an automatic snapshot.
- indexGate: default false. Require `agents_index action=audit` status pass or warn before compression; `incomplete` (no recorded requirements) is denied. The normal card/record gates still apply after the pressure exemption.
- taskGate: default false. Require a user-confirmed active task with a matching path scope before write/edit/pwsh/non-read-only run_code/plugin_manager mutations; `taskGateTools` lists the guarded tools. `agents_task` itself, read-only tools, agents_index, agents_memory, and agents_verify remain allowed.
- continuityGate: default true. Below 80% context pressure, compression requires a ready current `agents_handoff`; at or above 80% the host projection is allowed as the emergency fallback.
- continuityMaxChars: default 1600; range 300–4000. Caps the continuity card and `AGENT_CONTINUITY.md`.
- continuityFile: default AGENT_CONTINUITY.md. writeContinuity: default true; skip the file when false. The file never contains raw reasoning or a transcript.
- reasoningGate: default true. Set false to disable the reasoning gate.
- reasoningTools: default [write, edit, pwsh, compress, run_code].
- reasoningVerifyTools: default [read, glob, grep, web_search, web_fetch, session_event_read, session_event_search, session_event_trace, session_search, session_trace].
- reasoningRiskGate: default true. Enable the independent risk signals (repetition, drift, constraint conflict).
- semanticReview: default true. Run one independent LLM review per risk; results are advisory.
- riskReviewFailure: `allow` (default) or `block`. When `allow`, an unavailable or invalid review never blocks writes by itself.
- writeReasoningState: default true. Write the distilled AGENT_REASONING_STATE.json.
- loopThreshold / toolRepeatThreshold: default 2 / 3. Consecutive similar reasoning / identical tool calls before a risk.
- recentMemoryMax: default 12; range 3–50. Recent operation/thought entries kept before the oldest is dropped.
- maxReasoningQuestions: default 8; range 1–64. Maximum open reasoning questions per turn.

## Limitations

- The six new gates are bookkeeping and heuristics, not a security boundary. The model can write a plan or a passing check without the host proving it; the gates make omissions visible and block the default path, but they do not certify a real build, test, or backup. `recoveryGate` records a baseline, it does not create one.
- The automatic index is deterministic and bounded. Candidate decisions and open items are keyword heuristics, not a semantic summary; read the original message before relying on them.
- agents_memory entries are model-written distilled conclusions, not user confirmation and not a transcript. They are capped by `memoryTextMax` (default 600 characters); use agents_index search (`raw-user-message`) when the exact wording matters. A decision or verified fact without evidence is a lead, not a fact.
- Only messages whose source kind is user are indexed. Plugin-injected context is ignored to avoid a self-feeding loop.
- There is no user-message ambiguity detector. A normal question is informational; ask for clarification only when multiple interpretations would change the implementation direction. The reasoning gate handles unresolved questions in the model's own reasoning.
- The reasoning detector looks for explicit uncertainty and direct self-questions; ordinary planning phrases such as "needs" or "should" are ignored. It can miss a subtle doubt. A failed verification does not clear the gate. agents_verify accepts `questionId` or `questionIds`; one successful read clears every listed question, while unlisted questions remain. A user reply resolves only the question that was asked. Normal user questions, including answer-card messages beginning with 【回答 or containing →, are not treated as ambiguity.
- The compress guard trusts the injection bookkeeping of this process. After a restart the first turn injects a fresh card; a session with no card at all is allowed only by the fixed internal `legacyCompressWithoutCard` fallback or the official tokenMeter pressure at the forced threshold. The fallback is not a settings-page switch. If tokenMeter is unavailable or has no recorded request yet, the pressure exemption is inactive and normal gating applies.
- A subagent session has its own index and its own guard state. The plugin does not merge subagent memory into the parent.
- This plugin does not replace dsh-repeat-tool-reminder. That built-in package already nudges exact repeated tool calls at 3, 5, and 8 repeats.

## Repository layout

- `lib/core.mjs`: pure projection, detectors, and card rendering.
- `lib/index.mjs`: Host entry, projection registration, tool guard, injection, and writes.
- `test/core.test.mjs`: dependency-free unit tests.
- `docs/DETAIL.md`: implementation details.
- `locale/`, `cordis.patch.yml`: DSH bundle metadata.
- `.github/workflows/ci.yml`: GitHub Actions.

## Compatibility

Optional services and missing plugins are a supported class of environments, not only the compression plugin. See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md): no `compress` tool, no `tokenMeter`, no `settings` service, no client settings page, no `workspaceFiles` (agents_verify unavailable), no `llm` review, and older DSH without `tools.guard` (gates disabled, index tools still load). Compression-only gates never affect ordinary writes; without a compression plugin, use step-boundary `agents_handoff save` for long tasks.

## Verification

Run the core tests:

    node test/core.test.mjs

Check syntax:

    node --check lib/core.mjs
    node --check lib/index.mjs

Live activation requires a new DSH session or a restart. Verify that:

1. the plugin row is active;
2. agents_memory appears in the tool list;
3. a turn injects the memory card and writes the generated block;
4. a normal question such as "用 A 还是 B？" does not create an ambiguity gate; only multiple interpretations that change the implementation direction require asking first;
5. ask_user is allowed and a pending reasoning question remains blocked until the user replies;
6. an assistant reasoning block such as 我不确定这个字段是否存在 denies a write call;
7. read-only run_code is allowed, including multiple read calls; mutating run_code and write/edit/pwsh/compress are denied while a reasoning question is open; agents_verify accepts `questionId` or `questionIds` and resolves every listed ID; agents_index returns the card without opening the file.
8. agents_handoff save returns ready; below 80% a compress without a ready handoff is denied, while the same session with a ready handoff is allowed; a new user message makes the handoff stale.
9. the settings page exposes the four group switches and their advanced options, including continuityGate, writeContinuity, and continuityMaxChars; saving changes the next guard call without a reload.
10. group off pauses only the child policy; raw child settings and accumulated task/memory/index/continuity/reasoning data remain.
11. an old profile without group fields derives each group from its child gates; the settings-page user layer, not the schema defaults, decides an explicit group switch.
