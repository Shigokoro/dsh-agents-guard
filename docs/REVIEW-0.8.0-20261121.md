# dsh-agents-guard 0.8.0 审查报告（供龙娘）

> 日期：2026-11-21
> 范围：工作树 0.8.0，包含 0.7.1 之后的 runtime task 状态修复与 context-continuity 功能。
> 重要：本报告是执行者自述 + 可重跑验证，不是独立第三方审计；SHA256 只是包身份，不是正确性证明。

## 1. 结论

- 0.7.1 的 recoveryGate 绑定修复保留；同一段 `run_code` 内 `agents_task close` 后继续写入的绕过已修复，并有回归测试。
- 0.8.0 新增上下文接续：分步计划、`agents_handoff`、接续卡、80% 兜底门控、压缩后恢复卡、独立 `AGENT_CONTINUITY.md`。用户已明确取消独立 70% 阈值，只保留 80%。
- 协议自动注入系统提示、任务/接续卡、80% 阈值提醒三处；不是只写文档。
- 本次实测又发现并修复一个投影缺陷：`agents_handoff` 不在 `SAFE_RUN_CODE_TOOLS` 时，单条 `run_code` 调用会执行成功但不会写入持久投影；加入 allowlist 并用规范单调用重存后，跨 reload 的状态为 ready。
- 仍未验证：真实 80% tokenMeter 提醒、真实设置页点击、GitHub Actions 实际运行。

## 2. 改动摘要

### 2.1 runtime task 状态

- `liveTasks`：`agents_task start/confirm/close` 成功后立即更新运行时任务；guard 用 `stateWithLiveTask`；`turn/start`/user 消息再与投影同步。
- `latestChange` 路径规范化：绝对/相对、`..`、父目录覆盖；最新匹配 change 为 verified 时返回 null，不回退到旧 planned。
- `decideRecovery` 要求当前目标有 planned/applied change，且 recovery 的 `changeId` 必须匹配；旧 change 的 baseline 不再放行。
- 回归覆盖同程序 close+write、start+confirm 新 scope、相对/绝对/`..`/父目录、verified 最新 change 不回退。

### 2.2 接续功能

- `agents_task` 支持 `steps`；每步完成调用 `agents_handoff save`（step/next/preserve/discard/risks），在步骤边界压缩。
- `continuityGate`（默认 true）、`continuityMaxChars`（默认 1600，300–4000）、`continuityFile`（默认 `AGENT_CONTINUITY.md`）、`writeContinuity`（默认 true）。
- 低于 80% 时，missing/stale/incomplete 接续会拒绝压缩；达到 80% 时宿主投影应急放行。没有独立 70% 阈值。
- 接续卡区分宿主投影与模型提炼内容；系统提示、卡片、80% 提醒三处注入协议。
- 设置页暴露 continuityGate/writeContinuity/continuityMaxChars；`cordis.patch.yml` 带默认值。

### 2.3 兼容性（不只是一个压缩插件例子）

- 没有 `compress` 工具时，`denyCompress`/`continuityGate`/`indexGate` 不触发，普通写入不受影响；索引、记忆、任务、证据/恢复账本与 `agents_handoff` 仍可用。
- 没有 `tokenMeter` 时没有 80% 提醒/压力豁免，需步骤边界手动 handoff；不会用文本长度估算上下文。
- `tools.guard` 改为可选：旧 DSH 缺少时插件仍加载并注册索引工具，但门控关闭并记录日志；`agents_guard_dev status` 显示 capabilities。
- `settings` 缺失回退启动配置；`workspaceFiles` 缺失使 `agents_verify` 明确报错且不降级 node:fs；`llm` 缺失跳过独立审查；客户端设置页缺失不影响 Host。
- 其他名字的第三方压缩工具不被拦截；详见 `docs/COMPATIBILITY.md`。

### 2.4 本次新发现

- `agents_handoff` 最初遗漏在 `SAFE_RUN_CODE_TOOLS`；`run_code` 内执行成功但投影不更新，重载后接续变 missing。
- 修复：加入 allowlist；`safeRunCodeCall` 回归测试；用恰好一条 `return await tools.agents_handoff({...})` 重存，跨 reload 后 status ready（savedSeq 25008）。
- 仍建议：handoff 保存使用规范单调用；包在 try/catch 或多语句中不会被外层识别为 handoff。

## 3. 验证证据

### 3.1 自动测试

```
npm run check
npm test
```

结果：exit 0；`core tests passed`、`guard tests passed`、`client tests passed`。
`self_test` 的确定性用例增至 14 项，新增 continuity 的 missing/ready/stale/80% 兜底；该 self_test 在 core tests 中运行，不等于真实会话的 80% 提醒已实测。core 测试另断言 continuity/index 门控只作用于压缩工具，不阻断普通写入；`agents_guard_dev status` 的 capabilities 字段已接入。

### 3.2 live

- `agents_handoff save` 单条调用返回 ready，savedSeq 25008。
- 插件 reload 后 `agents_handoff status` 仍为 ready（不再是 missing），证明投影持久化。
- `AGENT_CONTINUITY.md` 已写入工作区，包含 step/next/preserve/discard/risks 与恢复协议；不含原始推理或 transcript。
- 在接续 ready 后 `compress` 被放行；在无接续时同一门控会拒绝压缩（本次 turn 中已观察到 deny 与 allow 两侧）。
- 0.8.0 测试完成后未推送 GitHub。

### 3.3 变更规模

`git diff --stat`（未包含未跟踪文件）：13 个已跟踪文件，新增约 3458 行、删除约 365 行。未跟踪：`test/client.test.mjs`、`docs/PLAN-0.7.0.md`、`docs/PLAN-0.8.0-continuity.md`、本报告、`package-lock.json`。以包内 `DIFF.patch` 与 `source/` 为准。

## 4. 未验证与限制

完整、可随仓库发布的声明见 [`docs/UNVERIFIED.md`](UNVERIFIED.md)；本节是摘要。

- 真实 80% tokenMeter 提醒：本次未到 80%，仅有 guard 单测与 self_test 场景；未观察到真实注入。
- 未在“卸载压缩插件”的真实 profile 中跑端到端矩阵；无压缩行为来自代码分支、单测与兼容性文档，不是实测卸载。
- 真实设置页点击：字段、静态读取和 save 转换已检查；未用浏览器/UI 自动化点击保存。
- GitHub Actions 未检查实际运行结果。
- 全局 `C:/Users/Shigokoro/.dsh/AGENTS.md` 的 fallback 规则未改；本任务只改仓库内文档。
- 接续的 preserve/next/risks 是模型提炼文本；宿主只保证自己投影的字段，不宣称独立验证。
- 设置保存即时生效此前已用同一 settings 写路径验证；本次未重复点击。
- `risk-19294`：`AGENT_REASONING_STATE.json` 当前 risk=null；历史 repeat 已在 seq 22279 清除，不再阻断写入。
- 同程序 handoff 需规范单调用；包 try/catch/多语句的 save 不写入投影（工具本身仍执行，live overlay 可见，但 reload 后丢失）。

## 5. 审批清单（请龙娘确认）

1. 是否接受同程序 close+write 的 liveTasks 修复与回归，作为 0.7.1 合并阻断项的关闭证据？
2. 是否接受 0.8.0 接续设计：主路径分步 handoff，80% 仅宿主兜底，不保留 70%？
3. 是否接受“host 投影确定性 / 模型接续文本不独立验证”的边界声明？
4. 是否要求在合并前补真实 80% 提醒与设置页点击，还是把它们列为已知未验证项？
5. 是否允许在用户确认后推送/合并？当前未推送。

## 6. 包内容

- `REVIEW.md`：本报告。
- `docs/COMPATIBILITY.md`：缺失压缩插件、tokenMeter、settings、workspaceFiles、llm、客户端设置页时的行为矩阵。
- `docs/UNVERIFIED.md`：0.8.0 的显式已验证/未验证声明。
- `DIFF.patch`：已跟踪文件 diff；未跟踪文件另列于 `UNTRACKED.txt`，并包含在 `source/`。
- `STATUS.txt`：版本、git status、测试命令。
- `TEST-RUN.txt`：本次 `npm run check` / `npm test` 输出与 live 证据摘要。
- `source/`：完整工作树源码（排除 `.git`、`node_modules`、`dist`、`.tmp`、`package-lock.json`）。
