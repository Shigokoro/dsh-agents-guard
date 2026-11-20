# Agents guard

## Behavior

dsh-agents-guard is a Host plugin. It registers a host-only session projection named agentsGuardMemory at stateVersion 3. The projection folds committed session events into bounded lists:

- user requirements and corrections, from user/message events whose source kind is user;
- candidate decisions and open items, from assistant/message text with deterministic keyword checks;
- tool failures, from tool/result errors, using the matching tool/call name;
- changed files, from write or edit tool results;
- model-written entries, from successful agents_memory tool results;
- compression counts, from compress tool calls;
- ambiguity state, from user messages and ask_user/run_code calls (WAITING marker);
- per-question reasoning state, from assistant/message and assistant/attempt reasoning blocks; each question has an ID and a resolved/asked state.

At turn/start the plugin builds a compact memory card and injects it through agent.inject with source kind plugin:dsh-agents-guard. At turn/end and on user/message it updates `$DSH_HOME/agent-context/<sessionId>/AGENT_CONTEXT_INDEX.md`; it never writes the workspace-root file. The generated block is delimited by HTML comments; content outside the block is preserved.

## Model-written memory

The plugin registers agents_memory with action add and kind decision, verified, error, open, requirement, correction, or assumption. Required fields are kind and text. The text must be a distilled conclusion or requirement in the model's own words (at most 600 characters); the tool rejects longer text and transcript-like multi-line copies. Optional field: evidence. Raw user messages stay searchable through agents_index (`userLog`, labelled `raw-user-message`), so memory is not a second copy of the transcript. The projection adds the entry and sets memoryRecordedSeq only after a successful tool result; a pending or failed call does not pollute the index or clear the record gate. The next card shows the entry under LLM 记录, and the Markdown index shows it under the same heading.

## Recall / record gates

When the latest user message looks like a recall/history request, session_search, session_event_search, session_event_trace, session_trace, session_event_read, and search_context are denied until agents_index has run for that user seq. The card and system prompt name agents_index first; decompress/search_context are the documented fallback.

When the latest user message states a requirement, correction, decision, or acceptance criterion, write/edit/pwsh/compress and non-read-only run_code are denied until a successful agents_memory result covers that user seq. Ambiguity is resolved first; while it is unresolved, agents_memory is denied too. In PTC the record call must be exactly one safe `run_code` call with a JSON object; the safe-call parser does not accept JavaScript object literals with unquoted keys.

## Compression denial

The plugin registers a global tool guard. For compress, the guard reads the current session projection and the injection bookkeeping for that session. It denies when:

1. the projection is unavailable;
2. no card was injected in this session;
3. the injected card belongs to a different turn;
4. a user message arrived after the injected card.

The denial reason names the sequence numbers. It is a denial, not a reminder: the compress call does not run. `denyCompress` is fixed on. A session with no injected card is allowed only by the fixed internal `legacyCompressWithoutCard` fallback; it is not exposed in the settings page. A card that belongs to another turn or predates the latest user message is still denied unless the pressure exemption applies.

Before those checks, the guard reads the official `tokenMeter.contextPressure(session)` and compares `pressureTokens / contextWindow` with `compressPressureRatio` (default 0.8). When the ratio is at or above the threshold, compress is allowed immediately, even when the projection is unavailable, no card was injected, the card is stale, or the ambiguity/reasoning gates are open. This is the only escape hatch, and it applies only to compress: other mutating tools remain gated. The exemption is inactive before the first logged request or when tokenMeter has no `pressureTokens`/`contextWindow`; it never guesses context use from text length.

## Ambiguity gate

The gate reads the latest user message from the projection. It fires when the message matches a strong cue:

- an explicit alternative such as A 还是 B with a question mark;
- 随便, 你决定, 你看着办, 看着办, 都行, 你定, or 按你想法;
- a yes-or-no question such as 要不要, 是否, 能不能, 可不可以, or 行不行 with a question mark;
- 二选一, 哪个好, 选哪个, or 怎么办.

While the gate is open, write, edit, pwsh, run_code, and compress are denied with a reason that quotes the ambiguous message. ask_user_question, ask_user, agents_index, and agents_verify are allowed; agents_memory is denied until the ambiguity is clarified. Calling the official ask_user_question first, then ask_user, sets ambiguityAskedSeq and moves the gate to WAITING; it does not clear the gate. A new non-ambiguous user message clears the gate. run_code is allowed only for exactly one trusted safe call with JSON arguments. The allowlist is read, glob, grep, web_search, web_fetch, the session read tools, agents_index, agents_verify, agents_memory, ask_user, and ask_user_question. Any extra statement, non-JSON argument, or tool outside the list is denied; the guard does not claim to sandbox arbitrary JavaScript.

## Reasoning gate

The gate reads reasoning blocks from assistant/message and assistant/attempt. It fires on explicit uncertainty (不确定, 不清楚, 待确认, 需要验证, 尚未验证, 存疑, 疑问, not sure, uncertain, need to check) or a direct self-question at a sentence boundary (是否, 要不要, 该不该, 能不能, 为什么, 怎么, 如何, 哪个 followed by a question mark). A bare question mark alone does not fire it.

Each detected question gets a stable ID (q-<eventSeq>-<index>). While any question is open, write, edit, pwsh, compress, and arbitrary run_code are denied. run_code is allowed only for exactly one trusted safe call with JSON arguments, as in the ambiguity gate. agents_verify is the host-side read-only verification tool: read_file, list_dir, or grep only; it validates that questionId is currently open, and one successful result resolves only that ID. Calling the official ask_user_question first, then ask_user, moves the latest open question to WAITING; the user reply resolves only the asked question. If neither ask tool is available, a normal-text question is accepted; the next non-ambiguous user message resolves it. A failed verification does not resolve anything. agents_memory records decisions and evidence but does not clear the gate. A successful agents_verify through run_code is resolved from the outer run_code tool/call/tool/result pair, because nested tool calls are not guaranteed to be replayed as projection events. Answer-card messages beginning with 【回答 or containing → are treated as answers and do not trigger the ambiguity gate. The plugin also injects a one-time user-role notice naming the open question IDs, so the model can correct course before the next mutation.

## Event points

- sessionProjections.register: host-only projection, stateVersion 3 (additive fields are optional; old sessions refold instead of resetting).
- session/event turn/start: inject the card and record turn plus last user sequence.
- session/event turn/end and user/message: queue one Markdown update.
- session/event assistant/message and assistant/attempt: detect a reasoning question, inject one notice, and refresh the Markdown block.
- session/event tool/call and tool/result: record a questionId on the outer run_code call when its code is exactly agents_verify; a successful tool/result resolves only that question. A direct agents_verify call is handled the same way.
- tools.guard: forced-compress pressure exemption (official tokenMeter), then ambiguity gate, then reasoning gate, then compress gate.
- tools.register: agents_memory, agents_index (on-demand card/Markdown/counts/open questions), and agents_verify (fixed read_file/list_dir/grep only).
- systemPrompt.section: static discipline, order 7000.

## Safety and limits

The projection state is checkpointed by DSH and can refold from the session log. Injection bookkeeping is process-local, so after a restart the first turn injects a fresh card; an old session also gets a lazy card on its next session event. A session that has never injected a card may still compress only through the fixed internal `legacyCompressWithoutCard` fallback; it is not a settings-page switch. `denyCompress` and that fallback are fixed on. The pressure ratio comes from tokenMeter.contextPressure(); the plugin does not estimate context from text length or from a third-party projection. The plugin does not parse or rewrite the compress arguments; it gates on index coverage, not on a specific range. The Markdown writer uses the session working directory and preserves manual content outside the generated block. If two sessions share one working directory, the last writer wins; the generated block names the session id.

Gate coverage also classifies known mutating tool names beyond the configured lists: apply_patch, terminal, create/update/delete/push/merge and similar. Unknown capabilities still require a host inventory and are not proven read-only.

The ambiguity detector is conservative but not semantic. It can miss ambiguity or flag a harmless phrase. When it fires, the correct response is to ask a concrete question, not to bypass the gate. The gate does not open on ask_user_question or ask_user; it only enters WAITING and opens when a later non-ambiguous user message arrives.

The reasoning detector is heuristic. It prefers explicit uncertainty and direct self-questions; a bare question mark is not enough. Ordinary planning phrases are ignored, but a subtle doubt can be missed. The gate resolves one question at a time through agents_verify, or the asked question through a user reply; ask_user_question (official first) or ask_user only moves the latest question to WAITING. It cannot prove that verification semantically answered the question; it binds the successful host read to the selected questionId. The run_code allowlist is a capability allowlist of exact single calls, not a JavaScript sandbox; arbitrary code remains denied.

agents_memory writes a runtime entry and calls the Markdown writer immediately. The runtime map is process-local; the Markdown index keeps the entry after restart, but the card does not reload it automatically.

Each agents_memory entry is host-classified as model-inferred or assumption. The tool no longer accepts model-supplied source or authority, so the model cannot claim user-confirmed or tested. User messages are indexed as user-stated. The label is provenance, not independent verification.
