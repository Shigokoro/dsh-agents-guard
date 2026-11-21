# dsh-agents-guard 0.8.1 定版前核查报告

> 日期：2026-11-22
> 基线：`7d136cf`（0.8.0）之后的 0.8.1 工作树，已提交并推送。
> 状态：自动化测试与合法 settings API 核查完成；真实浏览器设置页点击仍未完成。源码与报告已提交并推送到 `origin/main`。

## 1. 核查范围

按龙娘对 0.8.1 的有条件接受意见执行：

1. 四组总开关的 `user` / `value` / 默认值优先级，以及显式 false 与旧配置迁移的组合。
2. “部分启用”是否按最终有效配置计算。
3. `maxEvidence` 从设置保存到 evidence 投影的完整链路。
4. 使用合法设置 API（或正常认证 UI）验证保存与重载；不绕过认证。
5. 四个总开关分别关闭时只影响自身，不清理数据、不覆盖子配置、不改变其他组。
6. 更新 PLAN 与 UNVERIFIED，区分自动化、真实会话和未验证事项。

## 2. 核查结果

| 项 | 状态 | 证据 / 边界 |
|---|---|---|
| A 配置优先级 | 通过（自动化 + 合法 API） | 旧配置按子开关推导；显式 user 优先；显式 false 在保存后重载仍为 false。 |
| B 部分启用 | 通过（客户端渲染测试） | 组关闭显示 Off；组开启但部分子项关闭显示 Partial；状态基于有效组/子项。 |
| C maxEvidence | 通过（合法 API + 投影） | 设置 `maxEvidence=1` 后，运行时配置为 1，2 条模拟 evidence 事件投影只保留 1 条。 |
| D 保存/重载 | 通过（合法 settings API） | `settings.mutate` 写入 user 层；`set_bundle false→true` 重载后仍保留；随后恢复原 profile。 |
| E 组隔离 | 通过（四个组单元 + 两个组 live） | 四个组分别关闭的循环断言：只暂停本组子项；workflow 与 continuity 另做了 live 设置验证；数值与原始子配置保留。 |
| F 文档 | 通过（本报告 + PLAN/UNVERIFIED） | 明确区分自动化、合法 API、真实 UI 和未验证项。 |

## 3. 自动化验证

```text
npm run check
# exit 0

npm test
# core tests passed
# guard tests passed
# client tests passed
```

新增/覆盖的断言：

- 旧 workflow 混合子项推导为开启；全部关闭推导为关闭。
- 显式 user true 覆盖 schema/value false；显式 user false 覆盖子项 true；显式 null 不作为开启。
- 四个组分别关闭的循环测试：本组子项全部暂停，其他组子项保持，`maxEvidence` 不丢失。
- 客户端：显式关闭即使 Host value 省略组字段也显示 Off；组开启但 5 个 workflow 子项只有 2 个 true 时显示 Partial；空 value 使用 schema 默认值。
- `maxEvidence` 投影上限测试。

## 4. live 合法 settings API 验证

方法：临时注册仅测试用的 `agents_guard_api_probe`，调用 Host 的 `ctx.get('settings')`：

- `settings.describe()` 读取 `user`、`value`、`revision`。
- `settings.mutate(ns, [{ op: 'set', path: [key], value }], revision)` 写入。
- 读取 `effectiveConfig(value, { explicit: user })` 并与 `value` / `user` 对照。
- 测试后删除探针并重载；最终源码不包含探针。

关键结果：

- 初始 `user` 没有四个组字段；`value.workflowEnabled=false`，但 workflow 子项均 true；有效组四个 true（旧 profile 推导正确）。
- 写入 `workflowEnabled=false`：user 变为 false，value 子项仍 true，有效 workflow 为 false；revision 17。
- 重载后：user 仍为 false，revision 19，有效 workflow 仍 false；其他组仍 true。
- 写入 `continuityEnabled=false` 与 `maxEvidence=1`：有效 workflow/continuity 关闭，reasoning/memory 仍开启；`maxEvidence=1`。
- 用当前运行时配置模拟两条 evidence：投影长度 1（`ev-9005`，claim `probe 2`），证明 `maxEvidence` 已进入投影链路。
- 测试后恢复：删除临时写入的 group/developerMode/maxEvidence 字段并重载；最终 `user` 只保留原始字段，有效四组全部由旧子项推导为 true。

边界：这里的 evidence 是临时探针直接调用 `reduceEvent`，不是 `agents_evidence` 工具在真实会话里的效果；`settings.mutate` 的 `unset` 在该 Host 上保留了字段，最终清理使用了精确 profile edit。

## 5. 未验证 / 剩余风险

1. **真实设置页点击**：没有正常认证浏览器或点击保存；只用了合法 settings API。视觉布局、折叠交互和真实“部分启用”显示仍未经浏览器端到端验证。
2. **真实 `agents_evidence` 工具路径**：`maxEvidence` 用投影函数验证，未在真实会话通过 `agents_evidence` 增加证据后再看卡片/门控。
3. **四个总开关的完整 UI 副作用**：workflow 与 continuity 做了 live；reasoning/memory 的 live 逐组副作用未做，只有单元断言。
4. **旧 DSH / 缺少可选服务 / 其他压缩工具名 / GitHub Actions / 独立第三方审计**：仍未验证，详见 `docs/UNVERIFIED.md`。

## 6. Git 与交付

- 源码与报告已提交并推送到 `origin/main`；本地审查包不进入 Git。
- 审查包由本工作树打包；临时探针已移除，`package-lock.json`、`dist/` 不进入源码包。
- 最终包 SHA256 见交付消息或包旁 sidecar。