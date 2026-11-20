# dsh-agents-guard

A Host-only DSH bundle that maintains a session index, accepts model-written memory entries, and blocks compression or mutating tools while a user ambiguity or a reasoning question is unresolved.

## What it does

- Folds user messages, candidate decisions, open items, tool failures, and changed files from the committed session log with a host-only session projection.
- Injects a compact memory card at the start of each turn, labelled as plugin-maintained history rather than a new user instruction.
- Updates AGENT_CONTEXT_INDEX.md in the session working directory, preserving hand-written content outside the generated block.
- Registers agents_memory so the model can record a user decision, verified fact, error, open item, requirement, correction, or assumption. A successful tool result adds the entry to the next card and to the Markdown index. Decisions and verified facts should carry evidence; an assumption is not a user decision.
- Registers a tool guard for compress. The guard denies the call when the card was not injected for the current turn, or when the latest user message arrived after the injected card.
- Registers an ambiguity gate. When the latest user message is a strong ambiguity signal, write, edit, pwsh, run_code, and compress are denied until the model calls ask_user, or the user clarifies. run_code is allowed only when its code asks the user and does not also write or execute.
- Registers a reasoning gate. When the assistant's own reasoning contains an explicit unresolved question or uncertainty, write, edit, pwsh, compress, and non-read-only run_code are denied. A successful read-only verification call (read/grep/web_search or read-only run_code) clears the gate; ask_user also clears it. agents_memory records decisions and evidence but does not clear the gate.

## Install

Add this directory as a local DSH bundle (link or package) and enable the `agents-guard` entry. The bundle is host-only and has no runtime dependencies.

## Why this exists

AGENTS.md requires a persistent session index, forbids treating a compression reminder as a command, and requires asking when a request is ambiguous. A model can still compress before writing the index, or choose an interpretation and proceed. This plugin makes both failures blocking instead of advisory.

## Configuration

- enabled: default true. Set false to leave the plugin loaded but inactive.
- denyCompress: default true. Set false to keep indexing and injection but stop denying compression.
- writeIndex: default true. Set false to skip the Markdown file.
- indexFileName: default AGENT_CONTEXT_INDEX.md.
- maxCardChars: default 4200.
- maxRequirements: default 12.
- maxDecisions: default 6.
- maxOpenItems: default 6.
- maxFailures: default 6.
- maxChangedFiles: default 10.
- maxLlmEntries: default 40.
- ambiguityGate: default true. Set false to disable the ambiguity gate.
- ambiguityAllowRunCodeWithAsk: default true. When true, run_code is allowed only if its code asks the user and does not also write.
- ambiguityTools: default [write, edit, pwsh, run_code, compress].
- reasoningGate: default true. Set false to disable the reasoning gate.
- reasoningAllowReadOnlyRunCode: default true. When true, read-only run_code is allowed while a reasoning question is open.
- reasoningTools: default [write, edit, pwsh, compress, run_code].
- reasoningVerifyTools: default [read, glob, grep, web_search, web_fetch, session_event_read, session_event_search, session_event_trace, session_search, session_trace].

## Limitations

- The automatic index is deterministic and bounded. Candidate decisions and open items are keyword heuristics, not a semantic summary; read the original message before relying on them.
- agents_memory entries are model-written. They are not user confirmation. A decision or verified fact without evidence is a lead, not a fact.
- Only messages whose source kind is user are indexed. Plugin-injected context is ignored to avoid a self-feeding loop.
- The ambiguity detector uses strong cues only: explicit alternatives with a question mark, 随便/你决定/看着办/都行, yes-or-no questions with a question mark, and 二选一/哪个好/选哪个/怎么办. It can still miss a subtle ambiguity or flag a harmless one; when it fires, ask instead of arguing with the gate.
- The reasoning detector looks for explicit uncertainty and direct self-questions; ordinary planning phrases such as "needs" or "should" are ignored. It can miss a subtle doubt. A failed verification does not clear the gate. Answer-card messages beginning with 【回答 or containing → are treated as answers, not as new ambiguous requests.
- The compress guard trusts the injection bookkeeping of this process. After a restart the first turn injects a fresh card; compression before that first injection is denied.
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
5. ask_user is allowed and the next write is allowed after the question is sent;
6. an assistant reasoning block such as 我不确定这个字段是否存在 denies a write call;
7. read/grep/web_search and read-only run_code are allowed; a successful read-only verification or ask_user clears the reasoning gate.
