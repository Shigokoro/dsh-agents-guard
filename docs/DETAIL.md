# Agents guard

## Behavior

dsh-agents-guard is a Host plugin. It registers a host-only session projection named agentsGuardMemory at stateVersion 3. The projection folds committed session events into bounded lists:

- user requirements and corrections, from user/message events whose source kind is user;
- candidate decisions and open items, from assistant/message text with deterministic keyword checks;
- tool failures, from tool/result errors, using the matching tool/call name;
- changed files, from write or edit tool results;
- model-written entries, from successful agents_memory tool results;
- compression counts, from compress tool calls;
- ambiguity state, from user messages and ask_user tool calls;
- reasoning state, from assistant/message and assistant/attempt reasoning blocks.

At turn/start the plugin builds a compact memory card and injects it through agent.inject with source kind plugin:dsh-agents-guard. At turn/end and on user/message it updates AGENT_CONTEXT_INDEX.md. The generated block is delimited by HTML comments; content outside the block is preserved.

## Model-written memory

The plugin registers agents_memory with action add and kind decision, verified, error, open, requirement, correction, or assumption. Required fields are kind and text. Optional fields are evidence and source (user, tool, or model). The tool result is a confirmation; the projection adds the entry only after a successful tool result, so a failed call does not pollute the index. The next card shows the entry under LLM 记录, and the Markdown index shows it under the same heading.

## Compression denial

The plugin registers a global tool guard. For compress, the guard reads the current session projection and the injection bookkeeping for that session. It denies when:

1. the projection is unavailable;
2. no card was injected in this session;
3. the injected card belongs to a different turn;
4. a user message arrived after the injected card.

The denial reason names the sequence numbers. It is a denial, not a reminder: the compress call does not run.

## Ambiguity gate

The gate reads the latest user message from the projection. It fires when the message matches a strong cue:

- an explicit alternative such as A 还是 B with a question mark;
- 随便, 你决定, 你看着办, 看着办, 都行, 你定, or 按你想法;
- a yes-or-no question such as 要不要, 是否, 能不能, 可不可以, or 行不行 with a question mark;
- 二选一, 哪个好, 选哪个, or 怎么办.

While the gate is open, write, edit, pwsh, run_code, and compress are denied with a reason that quotes the ambiguous message. ask_user and agents_memory are allowed. run_code is allowed only when its code asks the user and does not also write or execute; the code check rejects writeFile, appendFile, unlink, rename, copyFile, mkdir, spawn, execFile, child_process, tools.write, tools.edit, tools.pwsh, tools.run_code, and fs write-like calls. A new non-ambiguous user message clears the gate.

## Reasoning gate

The gate reads reasoning blocks from assistant/message and assistant/attempt. It fires on explicit uncertainty (不确定, 不清楚, 待确认, 需要验证, 尚未验证, 存疑, 疑问, not sure, uncertain, need to check) or a direct self-question at a sentence boundary (是否, 要不要, 该不该, 能不能, 为什么, 怎么, 如何, 哪个 followed by a question mark). A bare question mark alone does not fire it.

While the gate is open, write, edit, pwsh, compress, and non-read-only run_code are denied. Read-only tools are allowed so verification can happen. A successful read-only verification call clears the gate; ask_user also clears it. A failed verification does not clear it. agents_memory records decisions and evidence but does not clear the gate. A new user message clears it. Answer-card messages beginning with 【回答 or containing → are treated as answers and do not trigger the ambiguity gate. The plugin also injects a one-time user-role notice naming the unresolved reasoning question, so the model can correct course before the next mutation.

## Event points

- sessionProjections.register: host-only projection, stateVersion 3.
- session/event turn/start: inject the card and record turn plus last user sequence.
- session/event turn/end and user/message: queue one Markdown update.
- session/event assistant/message and assistant/attempt: detect a reasoning question, inject one notice, and refresh the Markdown block.
- session/event tool/call and tool/result: mark read-only verification and clear the reasoning gate on success.
- tools.guard: ambiguity gate, then reasoning gate, then compress gate.
- tools.register: agents_memory.
- systemPrompt.section: static discipline, order 7000.

## Safety and limits

The projection state is checkpointed by DSH and can refold from the session log. Injection bookkeeping is process-local, so after a restart the first turn must inject a fresh card before compression is allowed. The plugin does not parse or rewrite the compress arguments; it gates on index coverage, not on a specific range. The Markdown writer uses the session working directory and preserves manual content outside the generated block. If two sessions share one working directory, the last writer wins; the generated block names the session id.

The ambiguity detector is conservative but not semantic. It can miss ambiguity or flag a harmless phrase. When it fires, the correct response is to ask a concrete question, not to bypass the gate. The gate does not prove that the user answered; it opens as soon as ask_user is called, or when a later non-ambiguous user message arrives.

The reasoning detector is heuristic. It prefers explicit uncertainty and direct self-questions; a bare question mark is not enough. Ordinary planning phrases are ignored, but a subtle doubt can be missed. The gate clears on a successful read-only verification, on ask_user, or on a new user message. It cannot prove that verification actually answered the question; it only observes a successful read-only call.

agents_memory writes a runtime entry and calls the Markdown writer immediately. The runtime map is process-local; the Markdown index keeps the entry after restart, but the card does not reload it automatically.
