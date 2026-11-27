# 兼容性与缺失依赖行为

> 适用：dsh-agents-guard 0.8.6。这里把“可选服务/插件缺失”作为一类问题处理；上下文压缩插件只是其中一个例子。
> 原则：核心索引、记忆、任务、证据/变更/检查/恢复账本与接续工具不依赖上下文压缩插件；只有真正会执行压缩的路径才受压缩相关门控影响。

## 1. 能力矩阵

| 能力/服务 | 是否必需 | 缺失时的行为 | 验证/备注 |
|---|---|---|---|
| `sessionProjections` | 是 | 插件无法建立索引投影，加载失败 | DSH Host 核心能力；没有它不能提供索引 |
| `tools.register` | 是 | 无法注册 agents_* 工具，加载失败 | 与索引同属核心 |
| `tools.guard` | 否 | 插件仍加载，索引/记忆/任务/接续工具仍注册，但**门控不生效**；日志记录 `toolsGuard=false`，`agents_guard_dev status` 可查 | 0.8.0 起做了可选注册 |
| 上下文压缩插件 / `compress` 工具 | 否 | 不执行压缩相关门控（`denyCompress`、`continuityGate`、`indexGate` 不会被触发）；接续工具与文件仍可用；压缩由用户/其他机制负责 | 这是本文的重点场景 |
| `tokenMeter.contextPressure()` | 否 | 没有 75% 提醒，也没有压力豁免；手动在步骤边界 `agents_handoff save`；`continuityGate` 仍只拦 `compress`（若存在） | 不估算上下文长度 |
| `settings` 服务 | 否 | 使用启动配置/插件行配置；设置页保存的即时生效不可用；不崩溃 | 读取失败会记录 warning |
| 客户端设置页 / `settings.section` | 否 | Host 工具与门控照常；只能改 profile/插件配置 | 客户端 bundle 是 UI 层，不是 Host 依赖 |
| `workspaceFiles` | 否 | `agents_verify` 明确报错并拒绝；直接 read/glob/grep 仍可用；Guard 不自行降级到 `node:fs` | 读取权限仍由 DSH 管理 |
| `llm` 服务 | 否 | 独立风险审查跳过（记录 warning）；`riskReviewFailure` 默认 `allow`，不会因此自锁 | 审查是辅助能力 |
| `ask_user_question` / `ask_user` | 否 | 无法用提问卡时用普通文本提问；用户回复仍可解除被提问的疑问 | 系统提示已说明 fallback |
| Markdown 索引写入 | 否 | `writeIndex=false` 时只保留运行时投影；`agents_index` 仍可读投影/卡片 | 文件是持久化辅助 |
| `AGENT_CONTINUITY.md` 写入 | 否 | `writeContinuity=false` 不写文件；接续卡/投影仍存在 | 文件是人工可读副本 |

## 2. 不使用上下文压缩插件时

1. Guard 不会因为没有 `compress` 工具而拒绝加载或拒绝普通写入；`denyCompress`、`continuityGate`、`indexGate` 只对名为 `compress` 的工具生效。
2. 索引、`agents_memory`、`agents_task`、`agents_evidence`、`agents_change`、`agents_check`、`agents_recovery`、`agents_verify`、`agents_handoff` 仍正常工作。
3. 长任务仍建议用 `agents_task steps` + 每步 `agents_handoff save`；如果其他机制会清空/压缩上下文，先保存接续，再从 `AGENT_CONTINUITY.md` 或下一轮接续卡恢复。
4. 没有 `tokenMeter` 时不会自动提醒 75%；这是**明确的能力缺失**，不是“已经安全工作”。需要用户或调用方在步骤边界主动 handoff。
5. Guard 不会拦截其他插件/宿主使用不同工具名执行的压缩；如果它们会丢上下文，仍然需要手动 handoff。这是当前边界，不是完整保证。

## 3. 使用其他上下文压缩机制时

- 当前只识别 DSH 的 `compress` 工具名。第三方压缩工具若使用其他名字，不会被 `denyCompress`/`continuityGate`/`indexGate` 拦截。
- 这不是“兼容并自动保护”，而是“不会硬失败，但仍需手动接续”。如果未来要覆盖其他工具名，应把工具名做成配置列表并同步测试/文档，而不是假设所有压缩都叫 `compress`。

## 4. 其他示例（同类问题，不只压缩）

- **没有设置页**：直接改 profile 的插件行；保存后下一次 Guard 调用会读取启动配置（实时 settings 不可用）。
- **没有 `tokenMeter`**：不要声称 75% 提醒存在；用步骤边界 handoff；不根据文本长度猜测上下文。
- **没有 `workspaceFiles`**：`agents_verify` 不可用，但普通 read/grep/glob 仍可用于调查；不要把 Guard 的 verify 当成唯一证据来源。
- **没有 `llm`**：风险审查不可用；不要把“审查失败”当成“风险已清除”。
- **旧 DSH 没有 `tools.guard`**：插件会加载但门控关闭；这是降级而非安全模式，日志和 dev status 会显示。

## 5. 验证

- 单元测试：`decideContinuity` 对非 `compress` 工具始终放行；`decideIndexGate` 对非压缩工具放行。
- `agents_guard_dev status` 的 `capabilities` 显示 settings/tokenMeter/workspaceFiles/llm/toolsGuard 是否存在。
- `npm run check` / `npm test` 覆盖核心路径；本次未逐一在“卸载每个插件”的真实 profile 中做端到端矩阵，缺失服务行为以代码分支、单测和显式报错为准。
