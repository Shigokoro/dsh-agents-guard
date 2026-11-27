# 未验证声明（0.8.7）

> 本文件是 0.8.7 源码的显式未验证声明。它不是安全认证，也不代表所有声明都经过独立复现。
> 适用范围：dsh-agents-guard 0.8.7；审查包与验证报告见 `docs/REVIEW-0.8.1-20261122.md`；真实会话 live 证据见 `docs/LIVE-TEST-2026-11-22.md`。

## 已验证

- `npm run check`：exit 0。
- `npm test`：exit 0；`core tests passed`、`guard tests passed`、`client tests passed`。
- 设置页分组渲染测试：用最小 React stand-in 实际渲染四个功能组、独立开发者区、关闭状态和组内数值项；这不是浏览器点击测试。
- 分组迁移/有效配置：单测覆盖旧子开关推导、显式 user 层优先、组关闭时子 Gate 暂停、数值保留、原始配置不被修改、运行时 decideTask/decideRecord/decideReasoning/decideContinuity 遵守组开关。
- 真实旧 profile 的 `settings` user 层迁移（2026-11-22 本机 Host）：`settings.describe()` 的 `user` 没有四个 group 字段；`value.workflowEnabled` 仍是 Schema 默认 `false`，但 `taskGate`/`evidenceGate`/`impactGate`/`verificationGate`/`recoveryGate` 均为 true，运行时有效 groups 为四个 true。由此确认旧 profile 会按旧子开关推导，而不是被 Schema 默认值关闭。
- 合法 settings API：`settings.mutate` 写 `workflowEnabled=false` 后 revision 17；`set_bundle false→true` 重载后 revision 19 仍为 false，其他组不受影响；随后恢复原 profile。
- `maxEvidence` 链路：合法 API 设 `maxEvidence=1`，运行时配置为 1，2 条模拟 evidence 事件只投影 1 条。
- 四组隔离：核心测试循环关闭四个组，逐组断言只暂停自身子项、其他组保持、数值保留；客户端渲染测试覆盖显式 Off、Partial 与空 profile 默认值。
- 真实 reasoning 组副作用（2026-11-22 本机 live）：组关闭时存在未解决疑问 `q-28537-0` 仍可写入 `.tmp/guard-live/reasoning-off-with-question.txt`；组开启时同一写入被拒绝（`unresolved question(s) [q-28537-0]`）；解除疑问后写入成功。`AGENT_REASONING_STATE.json` 在组关闭时哈希保持 `0e9525da...2feba`，组开启时由 `ff5ed081...1efa6` 变为 `a3e68f16...55e1`。
- 真实 memory 组副作用（2026-11-22 本机 live）：组关闭时 `agents_memory` 成功但 `AGENT_CONTEXT_INDEX.md` 哈希保持 `6734caec...c7dd`（writeIndex 被抑制）；恢复后索引找到测试条目 seq 28696。recordGate 关闭时写入成功、开启时拒绝，记录 seq 28946 后放行；recallGate 关闭时 `session_search` 无 Guard 拒绝，开启时先被要求 `agents_index`，单独一次安全调用解锁后搜索执行并在 30 秒超时；indexGate 关闭时无效 compress 到达工具并返回 `[Compression FAILED: no valid ranges parsed ...]`，无 Guard 报错。
- 四组 live 覆盖：workflow/continuity 由合法 settings API 覆盖；reasoning/memory 由真实会话覆盖。完整证据、命令与恢复哈希见 `docs/LIVE-TEST-2026-11-22.md`。
- 0.8.2 修复回归（2026-11-22）：`agents_recovery action=baseline` 不带 `changeId` 被拒绝，带存在 `changeId` 成功；memory 关闭/`writeIndex=false` 时 `agents_memory` 提示明确说明未更新 `AGENT_CONTEXT_INDEX.md`；只读多语句 `run_code` 中单个 `agents_index` 可解锁 recallGate，含写操作的同形态代码不解锁；`npm run check` 与 `npm test` 全绿。
- 0.8.2 live 重载（2026-11-22）：bundle 关闭再启用均 `application: applied`；真实 `agents_recovery baseline` 不带 `changeId` 返回 `changeId is required`，带 `chg-29506` 成功返回绑定该变更的 baseline。
- 0.8.4 压缩修复单测（2026-11-27）：`decideCompress` 在 mark 的 turn 落后时放行、user seq 落后时仍拒绝；`decideIndexGate` 放行 `warn`、拒绝 `incomplete`；`auditIndex` 按 critical/advisory 分类，`requirements` 与 `userLog` 全空为 `incomplete`；`injectCard` 的提前记账与缺失 agent/失败注入分支由 `guard.test.mjs` 覆盖。`npm run check` 与 `npm test` 全绿。
- 0.8.3 设置热更新 live（2026-11-27）：通过合法 settings API 临时把 `taskGate` 写入 user 层并立即生效：`true` 时下一次写入被拒绝（`target is outside the active task scope`，文件未创建），`false` 时下一次写入立即成功；无需重载。实际设置页点击仍未验证。
- 0.8.2 live memory-off（2026-11-22）：临时把 `memoryEnabled: false` 写入 profile 并重载后，真实 `agents_memory` 返回 `Recorded in the session memory card; writeIndex is off, so AGENT_CONTEXT_INDEX.md was not updated.`；恢复 profile 后 SHA256 回到 `A0C459...0DCEBC9`，`.tmp/guard-live3` 已删除。
- `agents_check action=add` 在严格单条安全调用下会投影；`add` 与 `status` 放在同一程序时不会投影，这是既有 single-safe-call 边界，不是 0.8.2 新增限制。
- 单元测试中的 14 项 `self_test` 通过（含 continuity 的 missing/ready/stale/75% 兜底）。该结果来自测试进程，不是真实会话的 80% 提醒。
- 真实 Host 重载后 `agents_handoff status` 为 `ready`；`AGENT_CONTINUITY.md` 已写入工作区。
- 接续 ready 后 `compress` 被放行；无接续时同一门控会拒绝压缩。
- 同程序 `agents_task close` 后写入被 taskGate 拒绝；`agents_handoff` 单条安全调用可写入持久投影；缺少 `SAFE_RUN_CODE_TOOLS` 条目导致的投影丢失已复现并修复。

- 0.8.7 挂载登记（2026-11-27 本机真实 profile）：用 DSH 自己的 `composeEntries`/`loadOverlayPatches` 组合真实 profile，改前 211 条、`agents-guard` 0 条并出现 `compose: patch: entry "agents-guard" not found`；把 `@local/dsh-agents-guard` 加进 `dsh.profile.bundles` 后 212 条、`agents-guard` 1 条（`name: @local/dsh-agents-guard`、无 config 键），guard 相关告警 0。随后无需重启，`tools.agents_*` 出现、`agents_handoff action=status` 返回 `build: 0.8.6`。
- 0.8.6 真实压缩链路（2026-11-27 本会话 live）：`agents_handoff action=save` 返回 `status: ready`、`savedSeq 3314`、`coveredUserSeq 3314`、`build 0.8.6`，同一 `run_code` 程序内紧接着的 `compress` 成功（208247 tokens，2 个块）。这正是 0.8.5 失败、且无 handoff 时被 `continuityGate` 拒绝的同一条路径。

## 未验证

1. **真实 75% tokenMeter 提醒**：本次会话未达到 75% 阈值，未观察到真实注入。只有 guard 单测、core 场景和 `self_test` 覆盖。
2. **设置页真实点击**：没有用浏览器或 UI 自动化点击保存。已检查字段、静态读取、默认值、真实 React 渲染（最小 stand-in）和保存转换；2026-11-22 用无头 Edge 访问本机 Web GUI 时返回 `dsh web authentication required`，没有绕过认证或执行已认证点击；这不等于浏览器 UI 端到端通过。
2b. **四个总开关的真实桌面 UI 行为**：workflow/continuity 已用合法 settings API、reasoning/memory 已用真实会话临时 profile 验证关闭/恢复与子项副作用；仍未在真实 DSH 桌面设置页点击四组开关并观察所有工具与文件副作用。
3. **卸载压缩插件的真实 profile**：没有在真实 profile 中卸载上下文压缩插件做端到端矩阵；“无压缩插件”行为来自代码分支、单测、`docs/COMPATIBILITY.md` 与显式错误路径。
3b. **indexGate 开启且审计失败/警告的真实拦截**：0.8.4 只在单测里验证 `incomplete` 拒绝与 `warn` 放行；没有在真实会话里开启 indexGate 复现拒绝，也没有观察一次 `warn` 审计后真实 compress 放行。
3c. **真实会话的压缩重放**：0.8.4 的 turn 判定修复没有用真实会话重放「卡片 turn 落后导致拒绝」的原始场景；Guard 重新启用后还没有实测过一次真实 compress 通过（单测只证明判定函数行为）。
3d. **注入失败/agent 缺失路径**：`injectCard` 在 agent 缺失或注入 Promise 挂起时的提前记账与 warn 日志只有单测与静态审查，没有在真实 Host 触发。
4. **其他压缩工具名**：Guard 只拦截 `compress`。第三方插件若使用其他工具名，不会被 `denyCompress`/`continuityGate`/`indexGate` 拦截；这是当前边界。
5. **旧 DSH 缺少 `tools.guard`**：可选注册分支未在旧版本 Host 上真实执行。缺少时预期是“插件加载、门控关闭、日志 warning”，但没有实测。
6. **GitHub Actions**：没有检查工作流的实际运行结果。
7. **全局 `C:/Users/Shigokoro/.dsh/AGENTS.md`**：本任务没有改全局规则；该文件不是仓库内容，不能作为随包发布的保证。
8. **独立审查**：报告是执行者自述 + 可重跑证据；没有第三方逐行审计。SHA256 只是包身份，不是正确性证明。
9. **宿主投影与模型接续文本**：projection 字段是确定性的；`step/next/preserve/discard/risks` 是模型提炼文本，不独立验证。
10. **`agents_check` 多调用投影边界**：`agents_check add` 只有作为单条安全 `run_code` 调用时才进入投影；同一程序里再调用 `status` 或其他安全工具不会投影 add。账本语义未改，工具描述已说明。
11. **0.8.5 的 live 压缩重放**：多调用 handoff 投影与卡片 seq 标记的修复只有 core 回归与本地 check/test；0.8.4 在真实会话里两次压缩被拒（`continuityGate ... missing: next`、`the index card covers user seq 740 but the latest user message is seq 1405`）是修复依据，但 0.8.5 尚未在重载后的 Host 上实测一次真实 compress 通过。
12. **0.8.6 的 live 压缩重放**：handoff 持久化链路（sidecar、live/投影/落盘合并、混合程序的 handoff 投影、0.75 阈值）已由 core 回归覆盖，`npm run check` 与 `npm test` 全绿；但直到本文件更新时，Guard 尚未重载并重新启用，因此「保存 handoff 后真实 compress 通过」仍未验证。这是 0.8.6 发布后必须补做的一步。

## 复现

```powershell
cd G:/AI/dsh_projectWorkArea/dsh-agents-guard
npm run check
npm test
```

审查包与报告：`docs/REVIEW-0.8.1-20261122.md` 与 `dist/dsh-agents-guard-0.8.1-review-20261122.zip`；真实会话 live 证据：`docs/LIVE-TEST-2026-11-22.md`；0.8.0 的旧包仅作历史记录。

## 声明边界

Guard 的任务/证据/影响/验证/恢复/索引/接续门控是工作流账本与启发式约束，不是安全认证，也不是完整沙箱。缺依赖时的降级只保证“不硬失败/不假装具备该能力”，不保证在缺少能力时仍能保护上下文或完成压缩。不能把本文件中的“已验证”理解为对全部功能、全部平台或全部插件组合的保证。
6. **代码改动的热加载**：本机 DSH 存在 `dsh-hmr`（`hmr/change`、`hmr/reload`、`watchConfig`），但 guard 的 `lib/*.mjs` 改动是否需要重新挂载没有实测确认；0.8.7 结论（配置热、代码需重挂载）来自 `apply()` 每次挂载只执行一次与 ESM 模块缓存，不是实测的反例。
