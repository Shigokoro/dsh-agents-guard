# dsh-agents-guard

> DSH Host 插件：确定性会话索引 + 压缩前拦截 + 歧义/思考疑问闸门。不调用 LLM，全部由会话事件折叠。

## 能力

- 从会话事件折叠用户要求/纠错、候选决策、未决项、工具失败和改动文件，写入 `$DSH_HOME/agent-context/<sessionId>/AGENT_CONTEXT_INDEX.md`（保留手工内容），不写工作区根目录。
- `agents_index` 按需读取索引：紧凑卡片、生成区块、计数和当前未决疑问，不需要手动打开文件。
- 每轮开始注入紧凑的“历史上下文卡”，明确标为历史上下文，不是新的用户指令。
- `agents_memory` 记录模型笔记、error、open item 或 assumption；source 固定为 model，authority 由宿主派生为 model-inferred 或 assumption，模型不能自报 user-confirmed/tested。用户消息作为 user-stated 索引；verified/decision 仍应带 evidence。
- 压缩前拦截：本轮索引卡未注入，或最新用户消息晚于索引卡时，`compress` 被拒绝；`legacyCompressWithoutCard`（默认 true）允许“从未注入过卡”的旧会话压缩。例外：官方 `tokenMeter.contextPressure()` 的 `pressureTokens / contextWindow` 达到 `compressPressureRatio`（默认 0.8）时，`compress` 强制放行，即使索引卡过期或歧义/思考疑问闸门开启。
- 歧义闸门：强歧义用户消息触发，阻断 write/edit/pwsh/run_code/compress；`run_code` 只允许恰好一条可信安全单调用（JSON 参数），任意代码与变更调用仍拒绝。调用 `ask_user` 只进入 WAITING，不会直接解除，需用户答复。
- 思考疑问闸门：每个未决疑问有独立 ID。存在未决疑问时，阻断 write/edit/pwsh/compress 与任意 run_code；`run_code` 只允许恰好一条可信安全单调用：read/glob/grep/web_search/web_fetch/会话读取/agents_index/agents_verify/agents_memory/ask_user。`agents_verify` 是宿主只读工具，只做 read_file/list_dir/grep，一次成功只解除对应 questionId；`ask_user` 进入 WAITING，用户答复只解除被提问的疑问；`agents_memory` 只记录，不参与解除。
- 回答卡消息（以 `【回答` 开头或包含 `→`）视为回答，不触发歧义闸门。
- 对 GitHub PAT、经典 token 和 Bearer token 做脱敏：写入索引、卡片和 agents_memory 输出前替换为占位符。

## 安装

把本目录作为本地 DSH bundle（link 或打包）安装，并启用 `agents-guard`。无运行时依赖。

## 配置

- `enabled`: 默认 true。
- `denyCompress`: 默认 true。
- `compressPressureRatio`: 默认 0.8；官方 `tokenMeter.contextPressure()` 达到该比例时强制放行 `compress`，取值需大于 0 且不超过 1。
- `legacyCompressWithoutCard`: 默认 true；允许从未注入过索引卡的旧会话压缩；设为 false 强制要求本轮卡。
- `writeIndex`: 默认 true。
- `indexFileName`: 默认 `AGENT_CONTEXT_INDEX.md`。
- `indexRoot`: 默认 `$DSH_HOME/agent-context`；实际文件位于 `<indexRoot>/<sessionId>/`。
- `maxCardChars` / `maxRequirements` / `maxDecisions` / `maxOpenItems` / `maxFailures` / `maxChangedFiles` / `maxLlmEntries`: 卡片与索引上限。
- `ambiguityGate` / `ambiguityAllowRunCodeWithAsk` / `ambiguityTools`：歧义闸门。
- `reasoningGate` / `reasoningTools` / `reasoningVerifyTools`：思考疑问闸门；`reasoningAllowReadOnlyRunCode` 已废弃且不生效，安全单调用由内置白名单控制，任意代码不再被当作只读。

修改配置后需重新加载该插件（或重启 DSH）才生效。`compressPressureRatio` 只读官方 `tokenMeter`；该服务不可用或尚未记录请求时，压力豁免不生效。`legacyCompressWithoutCard` 只影响“完全没有卡”的旧会话；最新用户消息晚于卡片的会话仍被拦截，除非压力达到阈值。

## 验证

```powershell
npm run check
npm test
```

`npm test` 覆盖歧义检测、思考触发词、按疑问 ID 解除、多疑问互不清除、失败验证不解除、安全单调用白名单、外层 run_code 解析、回答卡豁免和卡片/索引渲染。

## 仓库结构

- `lib/core.mjs`：纯函数投影、检测器和卡片渲染。
- `lib/index.mjs`：Host 插件入口、投影注册、工具守卫、注入与写盘。
- `test/core.test.mjs`：无依赖的单元测试。
- `docs/DETAIL.md`：实现细节。
- `locale/`、`cordis.patch.yml`：DSH bundle 元数据。
- `.github/workflows/ci.yml`：GitHub Actions。

## 限制

- 决策/未决项是关键词启发式，不是语义总结；依赖前回查原文。
- 推理检测只覆盖显式不确定/自问句；可能漏掉隐含疑虑。`run_code` 的安全白名单只允许恰好一条 JSON 单调用；多语句、任意 JS、写文件/shell/网络写仍拒绝，不把字符串正则当作完整沙箱。
- 运行时记忆存在于当前进程；Markdown 索引会保留，重启后下一轮卡片不会自动从索引恢复记忆。
