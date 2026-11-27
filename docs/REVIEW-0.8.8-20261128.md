# dsh-agents-guard 0.8.8 定版前核查报告

## 1. 核查范围

本版只解决一件事：**设置页保存的值，运行中的实例到底有没有用上**。

- 现象：0.8.7 里把门控值（六门、阈值等）在设置页保存后，页面显示成功，但下一次本该被拦的写入仍然通过；没有任何输出说明当前生效值来自哪一层。
- 根因：设置页写的是**插件条目 config**（`entry.options.config`），而 0.8.7 的 `syncConfig` 只在 `settings.describe()` 返回同命名空间行时取 `live.value`，取不到就回退到 `apply` 时捕获的 `rawConfig`（挂载快照）。两条路径都不读条目 config ⇒ 保存落在 profile 补丁里，运行时仍是挂载时的旧值。
- 决定：把配置解析收敛成一条纯函数链，并在每次受门控调用前重读条目 config；不改变任何门控判定逻辑（本轮不碰 task/evidence/impact/recovery/verification/index 的规则）。

## 2. 改动清单

1) `lib/core.mjs`
   - `GUARD_BUILD` 改为 `0.8.8`（第 4 行）。
   - 新增纯函数 `configSourceChain({ entry, live, raw })`（约 6-30 行）：优先级 **entry config > settings 文档 live.value > 挂载快照 raw > schema 默认**；空对象不算来源（`configLayer` 只认至少有一个键的对象），`explicit`（设置文档报告的 user 层）原样透传。
2) `lib/index.mjs`
   - 新增 `readEntryConfig()`（296-304 行）：读 `ctx.fiber.entry.options.config`，空对象即视为无来源。
   - `syncConfig()`（331-340 行）改为调用 `configSourceChain`，记录 `configSource`；刷新事件仍为 `loader/volatile-update`、`app-boot/config-reload`、`settings/document-updated`、`settings/changed`、`config/changed`（341-344 行）。
   - 诊断：`DSH_GUARD_CONFIG_DUMP=<路径>` 时写一份 JSON（`build`/`from`/`entryFound`/`liveFound`/各门取值）；`agents_guard_dev action=status` 的分组里新增 `configSource`。
   - 门控钩子（1640-1641 行）在每次调用开头执行 `syncConfig()`，所以「保存 → 下一次调用」之间无需重载。
3) `test/core.test.mjs`：新增 5 条回归——entry 优先于 settings/mount；空 entry 回退；`explicit` 透传；`configSourceChain({})` 报 `default` 且 values 为空；`GUARD_BUILD` 与 `package.json` 版本一致。
4) `package.json` 0.8.8；`CHANGELOG.md`、`README.md`、`README.zh.md`、`docs/DETAIL.md`、`docs/UNVERIFIED.md` 同步。

## 3. 自动化验证

本轮改动之后实跑的退出码与输出：

```
> @local/dsh-agents-guard@0.8.8 check
> node --check lib/core.mjs && node --check lib/index.mjs && node --check lib/client.js && node --check test/core.test.mjs && node --check test/guard.test.mjs && node --check test/client.test.mjs
                                   -> exit 0

> @local/dsh-agents-guard@0.8.8 test
> node test/core.test.mjs && node test/guard.test.mjs && node test/client.test.mjs
core tests passed
guard tests passed
client tests passed
                                   -> exit 0
```

## 4. live 验证（同一个运行中的 DSH 会话）

1) **配置改动即时生效（双向对照）**：`taskGate: true` 时，scope 外 `tools.write` 被拒：`dsh-agents-guard: target is outside the active task scope: G:/AI/dsh_projectWorkArea/.tmp/guard-config-tool.js`（00:04:40）。随后用户在设置页把 `taskGate` 关掉并保存，同一工具写同一目录（`.tmp/guard-a5-probe2.txt`）立即通过（00:07:28）。两次调用之间 `lib/index.mjs`（2026-11-27T15:57:15Z）与 `lib/core.mjs`（2026-11-27T16:02:31Z）的 mtime 未变，`agents_handoff action=status` 仍报 `build: "0.8.8"` ⇒ **窗口内没有任何重挂载**，配置热生效成立。
2) **代码改动经 DSH HMR 热加载**：profile 里给 `hmr` 配了监听根（`base: file:///G:/AI/dsh_projectWorkArea/dsh-agents-guard/`、`root: ["."]`），源码改写后运行实例从 `build: "0.8.7"` 变为 `build: "0.8.8"`，未重启 DSH。重载窗口可见：重载期间一次 `run_code` 报 `tools.agents_handoff is not a function`，下一步同一会话 10 个 `agents_*` 工具全部恢复。未配置监听根时只监听配置，源码改动不生效（0.8.7 的实测反例仍保留在 `docs/UNVERIFIED.md`）。
3) **真实压缩链路（延续 0.8.6 的修复）**：同一 `run_code` 程序内 `agents_handoff({action:"save"})` 返回 `status:"ready"`、`savedSeq 3314`、`coveredUserSeq 3314`，紧接着 `compress` 成功（约 208,247 tokens 被折叠）；随后 `status` 报 `source:"live"`。
4) **挂载登记（0.8.7 的结论在本版仍成立）**：用 DSH 自己的 `composeEntries` 复算真实 profile，改前 211 条 / `agents-guard` 0 条并报 `patch: entry "agents-guard" not found`；改后 212 条 / 1 条（`name: @local/dsh-agents-guard`，无 config 键）。

## 5. 未验证 / 剩余风险

- **75% tokenMeter 提醒**：本轮未达到阈值，未观察到真实注入；只有单测与 `self_test` 覆盖。
- **设置页的自动化点击**：本轮的开启/关闭由用户手工在设置页完成（行为对照已取证）；用无头浏览器做已认证点击仍未验证（0.8.3 起一直列在 `docs/UNVERIFIED.md`）。
- **`run_code` 的 task scope 缺口**：`taskPathOf`（`lib/core.mjs:2399-2403`）只读取 `file_path`/`path`/`filename`，带写入的 `run_code` 目标为空，`decideTask` 因此跳过 scope 与 exclusion 检查（`lib/core.mjs:2421`）。这是已确证的边界，按本轮范围约束未修，已写入 `docs/UNVERIFIED.md` 第 7 条。
- **更轻量的重挂载入口**：除重启 DSH、关闭再启用条目、以及 HMR 监听根之外是否还有其它入口，未验证。
- **独立审查**：本报告是执行者自述 + 可重跑证据；SHA256 只证明包身份，不证明正确性。

## 6. Git 与交付

- 0.8.8 代码提交：`8052bd1`（`fix(config): read the live entry config so settings changes apply (0.8.8)`，5 files +103/−8）与 `e652cbf`（`docs: record the 0.8.8 config chain and the code-reload evidence`，4 files +18/−6）。
- annotated tag `v0.8.8`（tag object `a0aca8a`）与当时 lightweight `latest` 指向 `e652cbf`；已 push，`git ls-remote` 复核 `refs/heads/main`、`refs/tags/v0.8.8^{}`、`refs/tags/latest` 同为 `e652cbf`。
- 本报告与 §4 的 live 证据随后另提交一次（docs only），`latest` 同步移到该提交；`v0.8.8` 标签仍指向代码提交。
- 包内 `source/` 为上述提交的源文件快照，未含未跟踪的 `dist/`、`docs/PLAN-0.7.0.md`、`docs/REVIEW-0.7.1-*`、`docs/HANDOFF-2026-11-21-*` 等历史文件。
