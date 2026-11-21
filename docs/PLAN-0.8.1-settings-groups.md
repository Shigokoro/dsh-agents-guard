# dsh-agents-guard 0.8.1：设置页分组与配置映射

> 状态：已实现四组总开关、组内高级选项、旧配置迁移、运行时有效配置与测试；真实旧 profile 的 `settings` user 层迁移已核对（user 无 group 字段时按旧子开关推导）。真实 DSH 设置页点击和逐个总开关的真实 Host 副作用尚未验证。
> 目标：让用户先决定“要不要这类能力”，再由高级选项控制组内 Gate；不删除原有字段、不改变各 Gate 的业务语义、不在关闭总开关时清空数据。

## 1. 分组映射

| 总开关 | 默认 | 子字段（全部保留） | 高级数值 |
|---|---|---|---|
| `workflowEnabled` | false（任务类 Gate 原本默认关闭） | `taskGate`、`evidenceGate`、`impactGate`、`verificationGate`、`recoveryGate` | `maxEvidence` |
| `continuityEnabled` | true | `continuityGate`、`writeContinuity` | `compressPressureRatio`、`continuityMaxChars` |
| `reasoningEnabled` | true | `reasoningGate`、`reasoningRiskGate`、`semanticReview`、`writeReasoningState` | `maxReasoningQuestions`、`loopThreshold`、`toolRepeatThreshold` |
| `memoryEnabled` | true | `recallGate`、`recordGate`、`indexGate`、`writeIndex` | `memoryTextMax`、`recentMemoryMax`、`maxCardChars` |

`developerMode` 不进入功能组，单独放在默认折叠的“开发与诊断”区域。

## 2. 有效配置

- 原配置字段全部保留；`normalizeConfig()` 返回原始子开关，供设置页和再次启用时使用。
- `effectiveConfig()` 返回运行时策略：对每个组，`effective.child = groupEnabled && child`。`effective.group` 仍保留总开关本身，便于诊断。
- 运行时 guard 链、工具读取、卡片/接续、状态文件写入都使用有效配置；这不是只在客户端隐藏控件。
- `compressPressureRatio` 是压缩压力兜底阈值，不是功能组开关；总开关关闭时仍作为压缩安全阈值使用。

## 3. 旧配置迁移

- 新总开关不存在时，从旧子开关推导：组内任一子开关为 true，则该组视为启用；全部为 false 则关闭。
- 运行时的 `settings.describe()` 提供 `user` 层；只有 `user` 中显式存在某个总开关时才采用该值，否则从子开关推导。这样 Schema 默认值不会把旧用户静默升级成“组开启”。
- 不覆盖旧子开关，不因为升级而自动开启原本关闭的 Gate。
- 混合状态显示为“部分启用”；关闭总开关只暂停该组，不删除数据、任务、记忆、索引、接续文件或推理状态文件。

## 4. UI

- 默认只显示四个功能组，每组显示名称、简短说明、总开关和“开启/关闭/部分启用”。
- 组内“高级选项”默认折叠；折叠内保留原有子开关与数值配置及其范围校验。
- 开发与诊断独立折叠，不混入普通功能开关。
- 保存仍走官方 `form.mutate`，字段与旧设置页一致；只增加四个 group 字段。

## 5. 影响矩阵

| 改动点 | 直接影响 | 间接影响 | 必须保持 | 验证 |
|---|---|---|---|---|
| `lib/core.mjs` | 分组默认值、迁移、`effectiveConfig` | 所有 `decide*` 与卡片/接续 | 旧子开关语义、数值范围 | core tests |
| `lib/index.mjs` | Config Schema、settings 读取、运行时有效配置、dev status | 热更新、工具执行、状态文件 | 保存/热更新链路、数据不删除 | guard tests + live |
| `lib/client.js` | 四组卡片、高级折叠、开发诊断 | 设置页与插件行配置页 | 保存字段、校验、主题 token | client render test |
| `cordis.patch.yml` | 四个默认值 | 新 profile / bundle | 旧 profile 不被强制升级 | 配置检查 |
| 文档 | 配置说明、未验证声明 | 审查包/用户操作 | 不夸大验证范围 | 文档回读 |

## 6. 实施顺序

1. 核心分组、迁移、有效配置与回归。
2. Host 配置 Schema、settings user 层、热更新与 dev diagnostics。
3. Client 四组卡片、高级折叠与渲染测试。
4. `cordis.patch.yml`、版本、CHANGELOG、README、DETAIL、UNVERIFIED。
5. 重载插件，检查真实设置页和运行时；未验证项继续显式列出。

## 7. 明确不做

- 不删除或重命名原有配置字段。
- 不改变 Gate 的判定逻辑，只增加组级 AND 条件。
- 不把关闭总开关实现成数据清理。
- 不在本次顺带重构无关模块，不推送 GitHub，除非用户明确要求。
## 8. 0.8.1 定版前核查（2026-11-22）

| 核查项 | 结果 | 证据 |
|---|---|---|
| 组优先级与迁移 | 通过 | 旧配置推导、显式 true/false/null、Schema 默认不覆盖旧子项；显式 false 保存后重载仍关闭 |
| 部分启用状态 | 通过（客户端渲染） | 组关闭显示 Off；组开启但部分子项 false 显示 Partial |
| maxEvidence 链路 | 通过（合法 API + 投影） | `settings.mutate` 设 1，运行时配置 1，2 条模拟证据只投影 1 条 |
| 保存/重载 | 通过（合法 settings API） | 写入 user 层，`set_bundle false→true` 后仍保留，随后恢复原 profile |
| 组隔离 | 通过（四组单测 + 两组 live） | 每组关闭只暂停本组子项；数值和原始子配置保留 |
| 文档 | 通过 | 本文件、`docs/REVIEW-0.8.1-20261122.md`、`docs/UNVERIFIED.md` |

结论：0.8.1 的代码级分组与合法 API 保存/重载已核查；真实认证浏览器点击、真实 `agents_evidence` 工具路径和 reasoning/memory 的 live 逐组副作用仍未验证。源码与报告已提交并推送到 `origin/main`。
