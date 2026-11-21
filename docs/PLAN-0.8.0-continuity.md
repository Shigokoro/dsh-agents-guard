# dsh-agents-guard 0.8.0：上下文接续可靠性

> 状态：0.8.0 已实现核心、测试、设置页与文档；真实 80% tokenMeter 提醒与设置页点击仍未在本次会话中实测。
> 目标：长任务接近上下文阈值时，先保留关键状态、清理临时材料，再在步骤边界压缩；压缩后能按接续卡继续，而不是依赖原对话。

## 1. 结论

- 主路径是分步计划：`agents_task` 记录 `steps`，每完成一步调用 `agents_handoff save`（step/next/preserve/discard/risks），在步骤边界压缩。
- 80% 只做宿主兜底：低于 80% 时没有 ready 接续就拒绝压缩；达到 80% 时允许宿主投影应急放行。用户明确取消了独立的 70% 阈值。
- 协议自动注入三处：系统提示 section、任务/接续卡、80% 阈值提醒（agent.inject）。只写文档不够。
- 接续卡区分 host-projected（确定性）与 model-distilled（模型提炼、不独立验证）；独立文件 `AGENT_CONTINUITY.md` 便于人工核对接续内容。
- 同程序 `agents_task close`+写入的绕过已由 liveTasks 修复；同程序 handoff 对 compress 可见由 liveHandoffs 修复。
- 兼容性作为缺失可选能力处理：没有压缩插件时只停用压缩门控，索引/记忆/任务/接续仍可用；没有 tokenMeter 时没有 80% 提醒，靠步骤边界手动 handoff。详见 `docs/COMPATIBILITY.md`。

## 2. 数据与状态

- memory projection v4 保留 task/authorization/evidence/changes/checks/recovery/indexAudit，并新增 `continuity`：status、step、next、preserve、discard、risks、savedSeq、lastUserSeq、updatedSeq、compressedSeq、authority。
- `handoffEntryFrom` 对文本走 redactSecrets 与长度上限；`buildContinuity` 生成宿主卡；`decideContinuity` 只对 compress 生效。
- `continuityStatus`：ready / missing / stale / incomplete。stale 由最新用户消息晚于 savedSeq 触发。
- 配置：`continuityGate`（默认 true）、`continuityMaxChars`（默认 1600，300–4000）、`continuityFile`（默认 AGENT_CONTINUITY.md）、`writeContinuity`（默认 true）。

## 3. 实施阶段

1. 核心状态、`agents_handoff`、`buildContinuity`、`decideContinuity`、卡/索引渲染。
2. Host 接线：配置、liveHandoffs/stateWithLiveContinuity、写文件、80% 提醒、guard 顺序、系统提示。
3. 设置页字段与 locale；`cordis.patch.yml` 默认值。
4. 回归：核心 handoff/门控/投影、guard 提醒与工具、client 字段、self_test 第 14 项（continuity）。
5. 文档与审查包；live 验证 durable handoff、reload、compress 放行。

## 4. 验证矩阵

| 验证 | 方式 | 结果 |
|---|---|---|
| handoff 输入上限/原文拒绝 | core tests | 通过 |
| ready/stale/missing/80% 兜底 | core tests + self_test | 通过 |
| 投影 stale/compressedSeq | core tests | 通过 |
| 80% 提醒每 turn 一次 | guard tests | 通过 |
| agents_handoff save/status/clear | guard tests | 通过 |
| 同程序 close+write | core/guard tests + live | 通过 |
| durable handoff 跨 reload | live | 通过（单条 run_code 调用；包 try/catch 不投影） |
| handoff→compress | live | 通过（0.8.0 压缩被接续门控放行） |
| 80% 真实 tokenMeter 提醒 | live | 未观察到（本次未达 80%） |
| 设置页真实点击 | live | 未执行（字段与静态读取已检查） |

## 5. 已知限制

- 接续的 preserve/next/risks 是模型提炼文本，不是独立审计；宿主只保证自己投影的字段。
- `compressedSeq` 的写入依赖投影事件；若 handoff 调用被包在 try/catch/多语句中，外层 run_code 不会被识别为 handoff，投影不会更新（本次实测发现并修复了 allowlist；使用规范单调用）。
- `continuityGate` 是工作流门控，不是上下文测量器；唯一的压力信号是官方 tokenMeter。
- 真实 80% 提醒、设置页点击、GitHub Actions 仍未验证。
