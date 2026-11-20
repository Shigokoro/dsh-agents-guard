# dsh-agents-guard

A DSH bundle that maintains a session index, accepts model-written memory entries, and blocks compression or mutating tools while a user ambiguity or a reasoning question is unresolved. It includes a Host entry and a small web settings page.

## What it does

- Folds user messages, candidate decisions, open items, tool failures, and changed files from the committed session log with a host-only session projection.
- Injects a compact memory card at the start of each turn, labelled as plugin-maintained history rather than a new user instruction.
- Updates `$DSH_HOME/agent-context/<sessionId>/AGENT_CONTEXT_INDEX.md`, preserving hand-written content outside the generated block. It never writes `AGENT_CONTEXT_INDEX.md` in the workspace root.
- Registers agents_index for on-demand index retrieval: the compact card, the generated Markdown block, counts, and the current open reasoning questions, without opening the file by hand.
- Registers agents_memory so the model can record a distilled conclusion, requirement, open item, error, or assumption. It accepts at most 600 characters in the model's own words and rejects transcript-like copies; raw user messages remain searchable through agents_index (`userLog`, labelled `raw-user-message`) instead of being duplicated as memory. The host sets source=model and authority=model-inferred (or assumption); the model cannot claim user-confirmed or tested. A successful tool result adds the entry to the next card and to the Markdown index. User messages are indexed as user-stated; decisions and verified facts should still cite evidence.
- Adds recall-first and record-first guards. A history question must call agents_index before session_search or another fallback search; session_search is denied until the index was queried. A new requirement, correction, decision, or acceptance criterion must be recorded with agents_memory before write/edit/pwsh/compress or non-read-only run_code. In PTC, the record call must be exactly one JSON call with quoted keys; a JavaScript object literal with unquoted keys is not accepted by the safe-call parser. Ambiguity is resolved first; while it is unresolved, agents_memory is denied too.
- Registers a tool guard for compress. `denyCompress` is fixed on and cannot be switched off. The guard denies the call when the card was not injected for the current turn, or when the latest user message arrived after the injected card. A session with no card at all is allowed only by the fixed internal fallback (`legacyCompressWithoutCard`, always true); it is not a settings-page switch. Exception: when the official `tokenMeter.contextPressure()` reports `pressureTokens / contextWindow` at or above `compressPressureRatio` (default 0.8), compress is allowed even if the card is stale or the ambiguity/reasoning gates are open.
- Registers an ambiguity gate. When the latest user message is a strong ambiguity signal, write, edit, pwsh, run_code, and compress are denied. Calling the official ask_user_question first, then ask_user, moves the gate to WAITING but does not clear it; it stays blocked until the user replies. If neither ask tool is available (for example, Deep PTC conversation cards are off), ask the same question in a normal reply; the next non-ambiguous user message clears the gate. run_code is allowed only for exactly one trusted safe call with JSON arguments; arbitrary code and mutating calls remain blocked.
- Registers a reasoning gate. Each unresolved question is tracked with its own ID. While any question is open, write, edit, pwsh, compress, and arbitrary run_code are denied. run_code is allowed only for exactly one call to a trusted safe tool with JSON arguments: read, glob, grep, web_search, web_fetch, the session read tools, agents_index, agents_verify, agents_memory, ask_user_question (official first), or ask_user. agents_verify is a host-side read-only tool limited to read_file, list_dir, and grep; all reads go through the DSH `workspaceFiles` service, so DSH owns path, symlink, and permission handling. The guard has no separate read-scope setting. One successful result resolves only its questionId. ask_user_question (official first) or ask_user moves the question to WAITING but does not clear it; a user reply resolves only the asked question. agents_memory records evidence but does not clear the gate.
- Redacts GitHub PATs, classic tokens, and Bearer tokens before storing index entries and rendering cards or agents_memory output.

## Install

Add this directory as a local DSH bundle (link or package) and enable the `agents-guard` entry. The bundle is host-only and has no runtime dependencies.

## Why this exists

AGENTS.md requires a persistent session index, forbids treating a compression reminder as a command, and requires asking when a request is ambiguous. A model can still compress before writing the index, or choose an interpretation and proceed. This plugin makes both failures blocking instead of advisory.

## Settings page

The DSH Settings section **Agents Guard** shows the read permission as read-only: DSH owns path, symlink, and permission handling, and Guard has no second read policy. The same page edits the common Guard policies through the official plugin configuration form. The plugin row configuration page provides the same controls.

The page edits only the common policies: the forced-compression threshold, the ambiguity and reasoning gates, Markdown index writing, and the card size cap. Compression denial and the legacy no-card fallback are fixed internal invariants and are not shown as switches. The remaining limits and tool lists stay in the plugin configuration.

## Configuration

- enabled: default true. Set false to leave the plugin loaded but inactive.
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
- recallGate: default true. Deny fallback session search until agents_index has run for the current user message.
- recordGate: default true. Deny mutation and compression until agents_memory has recorded the latest requirement, correction, decision, or acceptance criterion.
- ambiguityGate: default true. Set false to disable the ambiguity gate.
- ambiguityAllowRunCodeWithAsk: default true. When true, run_code is allowed only if its code asks the user and does not also write.
- ambiguityTools: default [write, edit, pwsh, run_code, compress].
- reasoningGate: default true. Set false to disable the reasoning gate.
- reasoningAllowReadOnlyRunCode: default false. Deprecated and not used by the reasoning gate. Safe single-call run_code is controlled by the built-in allowlist instead; arbitrary code is never treated as read-only.
- reasoningTools: default [write, edit, pwsh, compress, run_code].
- reasoningVerifyTools: default [read, glob, grep, web_search, web_fetch, session_event_read, session_event_search, session_event_trace, session_search, session_trace].

## Limitations

- The automatic index is deterministic and bounded. Candidate decisions and open items are keyword heuristics, not a semantic summary; read the original message before relying on them.
- agents_memory entries are model-written distilled conclusions, not user confirmation and not a transcript. They are capped at 600 characters; use agents_index search (`raw-user-message`) when the exact wording matters. A decision or verified fact without evidence is a lead, not a fact.
- Only messages whose source kind is user are indexed. Plugin-injected context is ignored to avoid a self-feeding loop.
- The ambiguity detector uses strong cues only: explicit alternatives with a question mark, 随便/你决定/看着办/都行, yes-or-no questions with a question mark, and 二选一/哪个好/选哪个/怎么办. It can still miss a subtle ambiguity or flag a harmless one; when it fires, ask instead of arguing with the gate.
- The reasoning detector looks for explicit uncertainty and direct self-questions; ordinary planning phrases such as "needs" or "should" are ignored. It can miss a subtle doubt. A failed verification does not clear the gate. One successful agents_verify result clears only the matching question; other open questions remain. A user reply resolves only the question that was asked. Answer-card messages beginning with 【回答 or containing → are not treated as new ambiguous requests.
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
4. an ambiguous message such as "用 A 还是 B？" denies a write call;
5. ask_user is allowed and the next write remains blocked until the user replies;
6. an assistant reasoning block such as 我不确定这个字段是否存在 denies a write call;
7. exactly one safe run_code call (read/grep/agents_index/agents_verify/ask_user_question/ask_user) is allowed; arbitrary run_code and mutating calls are denied; agents_verify resolves only its questionId; agents_index returns the card without opening the file.
