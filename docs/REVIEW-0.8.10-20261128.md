# dsh-agents-guard 0.8.10 定版前核查报告

## 1. 核查范围

本包覆盖 0.8.9 与 0.8.10 两版，主题是第一轮「基础状态修复」：记忆与任务在重启后能不能真的恢复，以及工具返回值是否满足宿主对声明 schema 的校验。

- **0.8.9（记忆闭环 + 任务恢复）**：`loadPersistedMemory` 原先只在 `agents_index` 里被调用，新进程或内存 Map 丢失后的那一轮注入的卡片会丢掉磁盘上已有的条目；`writeIndex` 是 fire-and-forget，写盘失败仍返回 `ok: true`；任务恢复依赖 `syncLiveTask`，但没有单点语义可测。
- **0.8.10（实机缺陷）**：`agents_memory` 的成功路径返回了 `file: null` 与 `error: null`，而该工具的 `output.schema` 把两者声明为字符串，宿主按声明校验后拒绝了整个结果 —— 真实调用原文：`tool "agents_memory" returned invalid output: "value.error" must be a string`。也就是说记忆闭环在容器内通过、在真实会话里任何一次成功调用都会失败。
- 本轮不改门控判定逻辑（task/evidence/impact/verification/recovery/index/continuity 的规则未动），也不改工具名、参数与配置语义。

## 2. 改动清单

**0.8.9**
1) `lib/index.mjs`
   - `loadPersistedMemory` 改为同步执行（`fsSync.readFileSync`），并在 `injectCard` 里、`buildCard` 之前调用；异步版本会把注入标记推到 `await` 之后，触发两条既有断言失败（`test/guard.test.mjs:118`、`:214`）。
   - `persistedLoaded` 只在读取成功或文件不存在（ENOENT）时置位；其它错误写入 `persistedErrors` 并记 warn，卡片照常注入但缺该条目，下一轮重试。
   - `writeIndex` 返回 `{ written, file, reason, error }` 且永不 reject；`agents_memory` 先 push，再 `await Promise.race([writeIndex(...), 2s])`，返回 `persisted` / `stored` / `file` / `error`，写盘失败时 `ok: false`；`writeIndex` 关闭时 note 明确写「session only … will not survive a restart」。
   - `syncLiveTask` 改为 `setLiveTask(session, mergeTaskState(live, projected))`。
2) `lib/core.mjs`：新增 `mergeTaskState(live, projected)` —— closed 不被陈旧 active 复活；active 可升级 proposed/更旧的 live；无 live 时用投影；投影缺失时不凭空造任务。
3) `test/guard.test.mjs` / `test/core.test.mjs`：A7（磁盘索引 → 新轮次卡片仍含该条；写盘失败不得声称持久化；读失败可重试）与 A8（七个 `mergeTaskState` 用例 + 无 liveTasks 的 Gate 集成块）。
4) `package.json` / `GUARD_BUILD` 0.8.9；CHANGELOG、README、README.zh、`docs/DETAIL.md`、`docs/UNVERIFIED.md` 同步。

**0.8.10**
5) `lib/index.mjs`：`agents_memory` 先构造 `result`（`ok/kind/text/source/evidence/authority/persisted/stored/note`），仅在 `persistence.file` / `persistence.error` 为真时追加这两个字段，避免 null 进入声明为 string 的槽位。
6) `test/guard.test.mjs`：成功结果必须不含 `error`、且不得有 null/undefined 值；失败结果必须带字符串 `error`。这是「返回值对声明 schema 合法」这一契约的回归。
7) `package.json` / `GUARD_BUILD` 0.8.10；CHANGELOG 新增 0.8.10 段；`docs/DETAIL.md` 新增 `## 0.8.10 output-schema conformance`；`docs/UNVERIFIED.md` 更新版本与条目。

## 3. 自动化验证

本轮改动之后实跑的退出码与输出：

```
> @local/dsh-agents-guard@0.8.10 check
> node --check lib/core.mjs && node --check lib/index.mjs && node --check lib/client.js && node --check test/core.test.mjs && node --check test/guard.test.mjs && node --check test/client.test.mjs
                                   -> exit 0

> @local/dsh-agents-guard@0.8.10 test
> node test/core.test.mjs && node test/guard.test.mjs && node test/client.test.mjs
core tests passed
guard tests passed
client tests passed
                                   -> exit 0
```

## 4. live 验证（同一个运行中的 DSH 会话，经 DSH HMR 热加载，未重启）

1) **0.8.9 已进入运行实例**：`agents_handoff action=status` 返回 `build: "0.8.9"`、`source: "persisted"`、`lastUserSeq: 4917`。
2) **0.8.10 的缺陷在实机复现**：真实调用 `agents_memory({"action":"add",...})` 被宿主拒绝，原文 `Error: code run failed (exception): ToolCallError: tool "agents_memory" returned invalid output: "value.error" must be a string`。此时容器内 check/test 全绿 —— 说明只断言字段语义、不断言输出形状，会漏掉「任何一次成功调用都报错」这类缺陷。
3) **0.8.10 已进入运行实例**：`agents_handoff action=status` 返回 `build: "0.8.10"`（同一会话，未重启）。
4) **修复后的真实调用**：`agents_memory` 返回 `{"ok":true,"kind":"decision",...,"persisted":true,"stored":"disk","file":"C:\\Users\\Shigokoro\\.dsh\\agent-context\\session-48a2c297-...\\AGENT_CONTEXT_INDEX.md"}`，返回对象的 null/undefined 键数量为 0。
5) **落盘核对**：该索引文件 9,642 字节，包含本次写入的条目文本；`agents_handoff action=status` 仍为 `ready` / `source: persisted`。

## 5. 未验证 / 剩余风险

- **真实 DSH 重启后的任务五场景**：A8 用投影与 `mergeTaskState` 在测试容器内复现；没有重启 DSH 后逐条核对真实会话中 proposed/active/closed 的恢复（真实投影由宿主重建，可能与手写的 `state.task` 不同）。
- **同步读盘开销**：`injectCard` 每会话同步读一次索引（之后命中缓存）。大索引（数百 KB）下的首轮注入延迟未实测。
- **`run_code` 的 task scope 缺口**：`taskPathOf`（`lib/core.mjs:2399-2403`）只读 `file_path` / `path` / `filename`，带写入的 `run_code` 目标为空，`decideTask` 因此跳过 scope 与 exclusion 检查（`lib/core.mjs:2421`）；本轮按范围约束未修。
- **75% tokenMeter 提醒**：本轮未达到阈值，未观察到真实注入；只有单测与 `self_test` 覆盖。
- **设置页自动化点击**：门控开关仍由用户手工在设置页完成，已取得行为对照；无头浏览器已认证点击未验证。
- **独立审查**：本报告是执行者自述 + 可重跑证据；SHA256 只证明包身份，不证明正确性。

## 6. Git 与交付

- 0.8.9 代码提交：`f1ba04b`（`fix(state): reload memory from the index and merge task state after a restart (0.8.9)`，10 files +240/−53）；annotated tag `v0.8.9`（tag object `577f68d`）。
- 0.8.10 代码与文档提交：`bada8d3`（`fix(tool): keep agents_memory output inside its declared schema (0.8.10)`，9 files +31/−10）；annotated tag `v0.8.10`（tag object `84d9036`），lightweight `latest` 指向 `bada8d3`。
- 已 push；`git ls-remote` 复核：`refs/heads/main` = `bada8d3`、`refs/tags/latest` = `bada8d3`、`refs/tags/v0.8.10` = `84d9036`、`v0.8.10^{}` = `bada8d3`；`git show v0.8.10:package.json` 的 `version` 为 `0.8.10`。
- 包内 `source/` 为上述提交的源文件快照，未含未跟踪的 `dist/`、`docs/PLAN-0.7.0.md`、`docs/REVIEW-0.7.1-*`、`docs/HANDOFF-2026-11-21-*` 等历史文件。