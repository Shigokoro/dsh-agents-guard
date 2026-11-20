# dsh-agents-guard

> DSH Host 插件：确定性会话索引 + 压缩前拦截 + 歧义/思考疑问闸门。不调用 LLM，全部由会话事件折叠。

## 能力

- 从会话事件折叠用户要求/纠错、候选决策、未决项、工具失败和改动文件，写入 `AGENT_CONTEXT_INDEX.md`（保留手工内容）。
- 每轮开始注入紧凑的“历史上下文卡”，明确标为历史上下文，不是新的用户指令。
- `agents_memory` 记录 decision / verified / error / open / requirement / correction / assumption；verified/decision 应带 evidence，assumption 不等于用户确认。
- 压缩前拦截：本轮索引卡未注入，或最新用户消息晚于索引卡时，`compress` 被拒绝。
- 歧义闸门：强歧义用户消息触发，阻断 write/edit/pwsh/run_code/compress，直到 `ask_user` 或用户澄清。
- 思考疑问闸门：assistant 推理中出现显式不确定/自问句时，阻断 write/edit/pwsh/compress 与非只读 run_code；成功的只读验证会解除，`ask_user` 也可解除。`agents_memory` 只记录，不参与解除。
- 回答卡消息（以 `【回答` 开头或包含 `→`）视为回答，不触发歧义闸门。

## 安装

把本目录作为本地 DSH bundle（link 或打包）安装，并启用 `agents-guard`。无运行时依赖。

## 配置

- `enabled`: 默认 true。
- `denyCompress`: 默认 true。
- `writeIndex`: 默认 true。
- `indexFileName`: 默认 `AGENT_CONTEXT_INDEX.md`。
- `maxCardChars` / `maxRequirements` / `maxDecisions` / `maxOpenItems` / `maxFailures` / `maxChangedFiles` / `maxLlmEntries`: 卡片与索引上限。
- `ambiguityGate` / `ambiguityAllowRunCodeWithAsk` / `ambiguityTools`：歧义闸门。
- `reasoningGate` / `reasoningAllowReadOnlyRunCode` / `reasoningTools` / `reasoningVerifyTools`：思考疑问闸门。

修改配置后需重新加载该插件（或重启 DSH）才生效。

## 验证

```powershell
npm run check
npm test
```

`npm test` 覆盖歧义检测、思考触发词、只读验证解除、失败验证不解除、回答卡豁免和卡片/索引渲染。

## 仓库结构

- `lib/core.mjs`：纯函数投影、检测器和卡片渲染。
- `lib/index.mjs`：Host 插件入口、投影注册、工具守卫、注入与写盘。
- `test/core.test.mjs`：无依赖的单元测试。
- `docs/DETAIL.md`：实现细节。
- `locale/`、`cordis.patch.yml`：DSH bundle 元数据。
- `.github/workflows/ci.yml`：GitHub Actions。

## 限制

- 决策/未决项是关键词启发式，不是语义总结；依赖前回查原文。
- 推理检测只覆盖显式不确定/自问句；可能漏掉隐含疑虑。
- 运行时记忆存在于当前进程；Markdown 索引会保留，重启后下一轮卡片不会自动从索引恢复记忆。
