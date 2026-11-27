# dsh-agents-guard

> **验证状态（0.8.9）：未完全验证。** 已验证/未验证项见 [docs/UNVERIFIED.md](docs/UNVERIFIED.md)；未列出不等于保证。

> DSH Host 插件：确定性会话索引 + 压缩前拦截 + 思考疑问/风险闸门。折叠逻辑不调用 LLM；风险出现时可一次性调用当前模型做独立审查。

## 能力

- 从会话事件折叠用户要求/纠错、候选决策、未决项、工具失败和改动文件，写入 `$DSH_HOME/agent-context/<sessionId>/AGENT_CONTEXT_INDEX.md`（保留手工内容），不写工作区根目录。
- `agents_index` 按需读取索引：紧凑卡片、生成区块、计数和当前未决疑问，不需要手动打开文件。
- 每轮开始注入紧凑的“历史上下文卡”，明确标为历史上下文，不是新的用户指令。
- `agents_memory` 记录**提炼后的**结论、要求、error、open item 或 assumption；长度上限由 `memoryTextMax` 控制（默认 600 字），必须是模型自己的话，不能粘贴原文或多行转录。原文仍通过 `agents_index` 的 `userLog` 搜索定位（结果标记 `raw-user-message`），不把记忆变成第二份原文。source 固定为 model，authority 由宿主派生为 model-inferred 或 assumption，模型不能自报 user-confirmed/tested。用户消息作为 user-stated 索引；verified/decision 仍应带 evidence。
- 回忆优先与记录优先闸门：历史/回忆类问题必须先调用 `agents_index`，之后才允许 `session_search` 等 fallback；用户给出要求/纠错/决策/验收标准时，先用 `agents_memory` 写提炼记忆，之后才能执行写入或压缩；只读工具与只读 `run_code` 不需要先记录。PTC 下记录必须是恰好一条 `agents_memory` 调用；JSON 对象与普通 JavaScript 对象字面量都能被安全解析。普通问句不算歧义。
- 结构化证据（`agents_evidence`，`evidenceGate` 默认 false）：记录 claim 的来源、机制、条件、结果、阳性对照与 observed/contradicted 状态；模型不能自报 verified。可要求 verified/decision 记忆引用已存在的证据 ID。
- 影响与不变量（`agents_change`，`impactGate` 默认 false）：变更计划记录目标、直接影响、间接影响、至少一条不变量与验证计划；受保护写入前必须先有计划。
- 变更验证（`agents_check`，`verificationGate` 默认 false）：检查项绑定 change，必须记录 pass 才能把变更标记为 verified。
- 恢复点（`agents_recovery`，`recoveryGate` 默认 false）：高风险写入前必须记录与该变更 `changeId` 绑定的 baseline（副本、提交或精确恢复点）；别的变更的 baseline 不能放行本次写入。这是登记项，不是自动备份。
- 索引完整性（`agents_index action=audit`，`indexGate` 默认 false）：压缩前必须有一次 status=pass 或 warn 的审计；`incomplete` 会拒绝并列出空的必需区块。只有 advisory 区块为空时给 warn（例如还没写盘的会话），不影响压缩。
- 任务授权闸门（`taskGate`，默认 false）：`agents_task start` 只登记模型提出的目标、允许的路径前缀和排除路径，提案本身不等于用户授权；`confirm` 只有在最新用户消息是确认时才成功，`close` 关闭任务。启用后，write/edit/pwsh/含写入的 `run_code` 与 plugin_manager 变更需要 active 任务，范围外或排除路径会被拒绝；卡片显示任务状态，开发者模式仍可旁路。范围检查是启发式，不是安全边界。
- 上下文接续（`continuityGate` 默认 true）：长任务用 `agents_task` 的 `steps` 登记分步计划；每完成一步调用 `agents_handoff save`，记录 step/next/preserve/discard/risks，并在步骤边界压缩。低于 `compressPressureRatio`（默认 0.75）时没有 ready 接续会拒绝压缩；达到该阈值则允许宿主投影兜底，不另设 70% 阈值。接续卡区分宿主投影与模型提炼内容；同时写入 `AGENT_CONTINUITY.md`，压缩后按卡恢复，不重做已完成操作。
- 兼容无上下文压缩插件：没有 `compress` 工具时，压缩相关门控（`denyCompress`、`continuityGate`、`indexGate`）不会触发；索引、记忆、任务、证据/恢复账本与 `agents_handoff` 仍可用。没有 `tokenMeter` 时没有 80% 提醒或压力豁免，需在步骤边界手动 `agents_handoff save`；其他插件使用不同工具名的压缩不会被拦截。
- 压缩前拦截：`denyCompress` 固定为开启，不提供关闭入口。本轮索引卡未注入，或最新用户消息晚于索引卡时，`compress` 被拒绝；旧会话在恢复后的首个 `turn/start` 或任意会话事件会补注入卡，另有固定的“无卡旧会话”兜底（`legacyCompressWithoutCard`，固定 true），避免插件在轮次中途加载时把 compress 锁死。例外：官方 `tokenMeter.contextPressure()` 的 `pressureTokens / contextWindow` 达到 `compressPressureRatio`（默认 0.8）时，`compress` 强制放行，即使索引卡过期或思考疑问闸门开启。
- 不把用户问句当歧义：问句只是信息请求；只有同一请求存在会改变实现方向的多解时才需要先提问。模型自己推理中的未解决疑问由下面的思考疑问闸门处理；它不会阻断直接只读工具。
- 思考疑问闸门：每个未决疑问有独立 ID。存在未决疑问时，阻断 write/edit/pwsh/compress 与含写入的 `run_code`；只读 `run_code`（包括多句只读调用）放行。判定依据是代码里是否出现 tools.write/edit/pwsh/terminal/plugin_manager、fs 写入/重命名/删除/mkdir、child_process/spawn/exec 等变更 API。直接 read/glob/grep 与 `agents_verify` 永不被阻断。`agents_verify` 是宿主只读工具，只做 read_file/list_dir/grep；传 `questionId` 或 `questionIds`，一次成功解除所列全部 ID，未知 ID 通过 `missingIds` 返回。官方 `ask_user_question` 优先、其次 `ask_user`，两者都进入 WAITING，用户答复只解除被提问的疑问；`agents_memory` 只记录，不参与解除。
- 用户问句（包括以 `【回答` 开头或包含 `→` 的消息）不会被当成歧义。
- 开发者模式：`developerMode`（默认 false）旁路所有闸门，便于回归测试；不旁路 DSH 权限、路径处理或索引维护。设置页提供开关，日常使用请关闭。
- 设置页按四个功能组组织：`workflowEnabled`（任务与变更）、`continuityEnabled`（上下文接续）、`reasoningEnabled`（推理检查）、`memoryEnabled`（记忆与索引）；每组有总开关、开启/关闭/部分启用状态和默认折叠的高级选项，开发与诊断独立折叠。关闭总开关只暂停该组，不删除子配置或已积累的数据；旧配置没有组字段时从子开关推导。
- 开发者模式提供 `agents_guard_dev` 测试工具：`status` 读取实时状态，`self_test` 跑 14 个确定性闸门用例（含任务、证据、影响、验证、恢复、索引、接续闸门），`simulate` 模拟单个场景（含 `task`），`probe_write` 在 `.tmp/guard-dev` 下创建并立即删除一个测试文件。测试工具不修改真实投影、Markdown 索引或推理状态文件；只有 `probe_write` 会做受控写入。
- 推理风险闸门：无新证据的重复推理、相同工具签名重复、已完成操作重复、明确约束冲突、自报 loop/drift 会开启风险；风险未清前阻断写入，只读检查与 `agents_verify` 仍可用。可选的一次性独立 LLM 审查只作辅助，审查失败可配置为放行，避免自锁。
- 推理原文不入库：只保存模型自报的 `GUARD_SUMMARY`（目标/决策/不确定项/下一步）；只有摘要中的不确定项会成为未决疑问。清除最后一个歧义疑问时同步清除对应风险；旧状态通过 reasoning projection 版本迁移清理。
- 对 GitHub PAT、经典 token 和 Bearer token 做脱敏：写入索引、卡片和 agents_memory 输出前替换为占位符。

## 安装

把本目录作为 profile 的本地依赖（`link:` 即可），再把 `@local/dsh-agents-guard` 写进 profile 清单的 `dsh.profile.bundles`。插件自带 `dsh.bundle.patch`，`agents-guard` 节点由 DSH 自己插入。

不要把 `- id: agents-guard` 顶层条目粘进 profile 的 `cordis.patch.yml`：非 `insert` 补丁只能覆盖已存在的节点，DSH 只会在告警里写 `patch: entry "agents-guard" not found` 并跳过——这就是插件装了却始终不出现在工具列表、重启也没用的原因。

参数在设置页改（或走 `settings.update`），改完下一次门控调用即生效，不需要重载。改 `lib/*.mjs` 才需要重新挂载（插件停用再启用，或重启应用），因为 `apply()` 每次挂载只跑一次、ESM 模块有缓存。

## 配置

- `enabled`: 默认 true。
- `developerMode`: 默认 false。测试时旁路所有闸门；不旁路 DSH 权限或索引维护，日常请关闭。
- `workflowEnabled`: 默认 false。任务/证据/影响/验证/恢复五个 Gate 的总开关；子开关保持独立，旧配置没有该字段时从子开关推导。
- `continuityEnabled`: 默认 true。`continuityGate` 与 `writeContinuity` 的总开关；数值设置保留。
- `reasoningEnabled`: 默认 true。`reasoningGate`、`reasoningRiskGate`、`semanticReview`、`writeReasoningState` 的总开关；数值设置保留。
- `memoryEnabled`: 默认 true。`recallGate`、`recordGate`、`indexGate`、`writeIndex` 的总开关；数值设置保留。
- `compressPressureRatio`: 默认 0.75；官方 `tokenMeter.contextPressure()` 达到该比例时强制放行 `compress`，取值需大于 0 且不超过 1。
- `legacyCompressWithoutCard`: 内部兼容项，固定 true；仅用于插件在轮次中途加载、尚未注入卡的兜底，不提供设置页开关。
- `writeIndex`: 默认 true。
- `indexFileName`: 默认 `AGENT_CONTEXT_INDEX.md`。
- `indexRoot`: 默认 `$DSH_HOME/agent-context`；实际文件位于 `<indexRoot>/<sessionId>/`。
- `maxCardChars` / `maxRequirements` / `maxDecisions` / `maxOpenItems` / `maxFailures` / `maxChangedFiles` / `maxLlmEntries`: 卡片与索引上限。
- `memoryTextMax`: 单条 `agents_memory` 提炼记忆的长度上限，默认 600，范围 100–2000。
- `recallGate` / `recordGate`：回忆优先与记录优先闸门（默认 true）。只读工具与只读 `run_code` 不受记录闸门阻断。
- `evidenceGate` / `agents_evidence`：证据门控（默认 false）；verified/decision 记忆需引用已存在的 `ev-N`。
- `impactGate` / `impactGateTools`：影响与不变量门控（默认 false）；受保护写入需有带 invariant 的 `agents_change` 计划。
- `verificationGate`：变更验证门控（默认 false）；`agents_change action=verify` 需要至少一条 pass 的 `agents_check`。
- `recoveryGate`：恢复点门控（默认 false）；高风险写入前需用 `agents_recovery baseline` 记录与当前 `changeId` 匹配的 baseline。
- `indexGate`：索引完整性门控（默认 false）；压缩前需 `agents_index action=audit` 状态 pass 或 warn（`incomplete` 拒绝）。
- `taskGate` / `taskGateTools`：任务授权闸门（默认 false）与受保护工具名单；`agents_task`、只读工具、`agents_index`、`agents_memory`、`agents_verify` 不受阻断。
- `continuityGate`：接续门控（默认 true）；低于 75% 时压缩必须有当前 ready 的 `agents_handoff`，达到 75% 则允许宿主投影兜底。
- `continuityMaxChars`：接续卡/接续文件上限，默认 1600，范围 300–4000。
- `continuityFile` / `writeContinuity`：独立接续文件名（默认 `AGENT_CONTINUITY.md`）与是否写入；写入内容不含原始推理或 transcript。
- `reasoningGate` / `reasoningTools` / `reasoningVerifyTools`：思考疑问闸门。
- `reasoningRiskGate` / `semanticReview` / `riskReviewFailure` / `writeReasoningState`：推理风险闸门、一次性独立审查及其失败策略、推理状态文件。
- `loopThreshold` / `toolRepeatThreshold` / `recentMemoryMax` / `maxReasoningQuestions`：循环与重复调用阈值、近期记忆条数、单轮疑问上限。

保存设置后下一次守卫调用即读取新值并生效，无需重载或重启；`compressPressureRatio` 只读官方 `tokenMeter`；该服务不可用或尚未记录请求时，压力豁免不生效。`denyCompress` 与 `legacyCompressWithoutCard` 是固定不变量，不提供设置页开关；最新用户消息晚于卡片的会话仍被拦截，除非压力达到阈值。

## 兼容性

可选服务/插件缺失是受支持的一类环境，不只是上下文压缩插件。详见 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)：没有 `compress` 工具、没有 `tokenMeter`、没有 `settings` 服务、没有客户端设置页、没有 `workspaceFiles`（`agents_verify` 不可用）、没有 `llm` 审查，以及旧 DSH 没有 `tools.guard`（门控关闭、索引工具仍加载）。压缩相关门控不影响普通写入；没有压缩插件时，长任务靠步骤边界的 `agents_handoff save` 手动接续。

## 验证

```powershell
npm run check
npm test
```

`npm test` 覆盖思考触发词、批量 questionIds 解除、多疑问互不清除、失败验证不解除、只读/写入 run_code 分类、外层 run_code 解析、任务提案/确认/范围/路径规范化、同程序 close+write 防绕过、证据/变更/检查/恢复/索引审计投影、六个新闸门的 fail-closed 行为、接续卡/接续门控/75% 兜底/接续投影、开发者模式、用户问句不触发闸门、分组迁移/有效配置非破坏性，以及设置页四组渲染和卡片/索引渲染。真实 profile 的 user 层迁移已核对：没有 group 字段时按子开关推导，不按 Schema 默认值关闭。

## 仓库结构

- `lib/core.mjs`：纯函数投影、检测器和卡片渲染。
- `lib/index.mjs`：Host 插件入口、投影注册、工具守卫、注入与写盘。
- `test/core.test.mjs`：无依赖的单元测试。
- `docs/DETAIL.md`：实现细节。
- `locale/`、`cordis.patch.yml`：DSH bundle 元数据。
- `.github/workflows/ci.yml`：GitHub Actions。

## 限制

- 决策/未决项是关键词启发式，不是语义总结；依赖前回查原文。
- `agents_memory` 只接受模型提炼后的结论（`memoryTextMax`，默认 600 字），不保存原文；确需原话时用 `agents_index` 搜索 `raw-user-message`。
- 推理检测只覆盖显式不确定/自问句；可能漏掉隐含疑虑。`run_code` 的只读分类是字符串/API 模式匹配，不是完整沙箱；只读多句放行，但含写入、shell、插件变更或混淆绕过写法的代码仍应被拒绝。
- 运行时记忆存在于当前进程；Markdown 索引会保留，重启后下一轮卡片不会自动从索引恢复记忆。
