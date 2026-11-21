# 未验证声明（0.8.0）

> 本文件是 0.8.0 源码的显式未验证声明。它不是安全认证，也不代表所有声明都经过独立复现。
> 适用范围：dsh-agents-guard 0.8.0；对应审查包 `dist/dsh-agents-guard-0.8.0-review-20261121.zip`。

## 已验证

- `npm run check`：exit 0。
- `npm test`：exit 0；`core tests passed`、`guard tests passed`、`client tests passed`。
- 单元测试中的 14 项 `self_test` 通过（含 continuity 的 missing/ready/stale/80% 兜底）。该结果来自测试进程，不是真实会话的 80% 提醒。
- 真实 Host 重载后 `agents_handoff status` 为 `ready`；`AGENT_CONTINUITY.md` 已写入工作区。
- 接续 ready 后 `compress` 被放行；无接续时同一门控会拒绝压缩。
- 同程序 `agents_task close` 后写入被 taskGate 拒绝；`agents_handoff` 单条安全调用可写入持久投影；缺少 `SAFE_RUN_CODE_TOOLS` 条目导致的投影丢失已复现并修复。

## 未验证

1. **真实 80% tokenMeter 提醒**：本次会话未达到 80% 阈值，未观察到真实注入。只有 guard 单测、core 场景和 `self_test` 覆盖。
2. **设置页真实点击**：没有用浏览器或 UI 自动化点击保存。已检查字段、静态读取、默认值和保存转换；这不等于 UI 端到端通过。
3. **卸载压缩插件的真实 profile**：没有在真实 profile 中卸载上下文压缩插件做端到端矩阵；“无压缩插件”行为来自代码分支、单测、`docs/COMPATIBILITY.md` 与显式错误路径。
4. **其他压缩工具名**：Guard 只拦截 `compress`。第三方插件若使用其他工具名，不会被 `denyCompress`/`continuityGate`/`indexGate` 拦截；这是当前边界。
5. **旧 DSH 缺少 `tools.guard`**：可选注册分支未在旧版本 Host 上真实执行。缺少时预期是“插件加载、门控关闭、日志 warning”，但没有实测。
6. **GitHub Actions**：没有检查工作流的实际运行结果。
7. **全局 `C:/Users/Shigokoro/.dsh/AGENTS.md`**：本任务没有改全局规则；该文件不是仓库内容，不能作为随包发布的保证。
8. **独立审查**：报告是执行者自述 + 可重跑证据；没有第三方逐行审计。SHA256 只是包身份，不是正确性证明。
9. **宿主投影与模型接续文本**：projection 字段是确定性的；`step/next/preserve/discard/risks` 是模型提炼文本，不独立验证。

## 复现

```powershell
cd G:/AI/dsh_projectWorkArea/dsh-agents-guard
npm run check
npm test
```

审查包与报告：`docs/REVIEW-0.8.0-20261121.md`、`dist/dsh-agents-guard-0.8.0-review-20261121.zip`。

## 声明边界

Guard 的任务/证据/影响/验证/恢复/索引/接续门控是工作流账本与启发式约束，不是安全认证，也不是完整沙箱。缺依赖时的降级只保证“不硬失败/不假装具备该能力”，不保证在缺少能力时仍能保护上下文或完成压缩。不能把本文件中的“已验证”理解为对全部功能、全部平台或全部插件组合的保证。
