(function () {
  const loader = window.__ModuleLoader__;
  if (!loader || typeof loader.load !== 'function') return;
  try {
    loader.load({
  id: '@local/dsh-agents-guard',
  factory: require => {
    const React = require('react');
    const h = React.createElement;
    const NS = 'agents-guard';
    const ENTRY_ID = 'agents-guard';
    const inject = ['slots', 'locale', 'configForms'];

    const dictionaries = {
      zh: {
        nav: 'Agents Guard',
        title: 'Agents Guard',
        subtitle: '维护会话索引，并在推理存在未解决疑问时阻止写入。',
        workflowGroup: '任务与变更管理',
        workflowGroupHint: '任务授权、证据、变更计划、验证与恢复管理。',
        continuityGroup: '上下文接续',
        continuityGroupHint: '分步交接、接续卡、压缩前检查与恢复。',
        reasoningGroup: '推理过程检查',
        reasoningGroupHint: '歧义、循环、风险与目标偏离检查。',
        memoryGroup: '记忆与索引维护',
        memoryGroupHint: '记忆召回、经验记录与索引维护。',
        groupOn: '开启',
        groupOff: '关闭',
        groupPartial: '部分启用',
        advancedOptions: '高级选项',
        devTitle: '开发与诊断',
        devHint: '开发模式、自检、能力状态与诊断信息。',
        devNote: '默认折叠，不参与日常功能配置；自检和能力状态请调用 agents_guard_dev。',
        developerMode: '开发者模式（测试）',
        developerModeHint: '旁路所有闸门，便于回归测试；仅测试时开启，日常使用请关闭。',
        permissionTitle: '读取权限（只读）',
        permissionTag: 'DSH 托管',
        permissionSummary: '由 DSH 统一管理；agents_verify 通过 workspaceFiles 继承当前会话权限。',
        configTitle: 'Guard 自有策略',
        configHint: '保存后立即写入当前插件行配置；Guard 在下一次守卫调用时读取新值。',
        rowSummary: '维护索引，并在推理存在未解决疑问时阻止写入。',
        rowHint: 'Guard 自有策略来自当前插件行配置；保存后立即写入，并在下一次守卫调用时读取。',
        advancedNote: '其余限制参数（条目上限、工具名单等）保留在插件配置中；本页只编辑常用策略。',
        loading: '正在读取配置…',
        unavailable: '当前 Host 没有向客户端提供这份配置。',
        readOnly: '当前配置只读。',
        enabledHint: '读取权限不在此处配置。',
        compressPressureRatio: '强制压缩阈值',
        compressPressureRatioHint: '上下文压力达到该比例时，即使索引卡缺失或闸门未解决也允许压缩。范围 0.05–1。',
        recallGate: '回忆优先闸门',
        recallGateHint: '回忆/历史请求必须先调用 agents_index，再使用会话搜索作为 fallback。',
        recordGate: '记录优先闸门',
        recordGateHint: '用户给出要求/纠错/决策后，先调用 agents_memory 写提炼结论，再执行写入或压缩。',
        taskGate: '任务授权闸门',
        taskGateHint: '写入前必须有用户确认的任务范围；提案本身不算授权，范围外与排除路径一律拦截。',
        evidenceGate: '证据门控',
        evidenceGateHint: 'verified/decision 记忆必须引用一条已登记的证据（agents_evidence）。',
        impactGate: '影响分析与不变量门控',
        impactGateHint: '写入前必须有 agents_change 计划的直接影响、间接影响和不变量；没有不变量一律拦截。',
        verificationGate: '变更验证门控',
        verificationGateHint: '标记变更已完成前，必须至少有一条 agents_check 记录为 pass 的检查。',
        recoveryGate: '恢复点门控',
        recoveryGateHint: '高风险写入前必须记录 agents_recovery baseline（备份、提交或精确恢复点）。',
        indexGate: '索引完整性门控',
        indexGateHint: '压缩前必须通过 agents_index action=audit 的索引完整性检查。',
        continuityGate: '接续卡门控',
        continuityGateHint: '压缩前必须有当前 agents_handoff；达到 80% 阈值时允许宿主接续卡兜底放行。',
        writeContinuity: '写入接续卡文件',
        writeContinuityHint: '在工作区写入 AGENT_CONTINUITY.md，供压缩后恢复。',
        continuityMaxChars: '接续卡最大字符数',
        continuityMaxCharsHint: '接续卡的字符上限；范围 300–4000。',
        maxEvidence: '证据条数上限',
        maxEvidenceHint: '会话保留的结构化证据条数上限；范围 1–100。',
        reasoningGate: '思考疑问闸门',
        reasoningGateHint: '推理中存在未解决疑问时，阻止写入；只读工具和只读 run_code 仍可用。',
        reasoningRiskGate: '推理风险门控',
        reasoningRiskGateHint: '出现循环、重复调用或明确目标偏离时，要求 GUARD_STATE 自报后再写入。',
        semanticReview: '独立语义审查',
        semanticReviewHint: '风险信号出现时调用一次当前模型做独立判断；会增加一次模型请求。',
        writeReasoningState: '写入推理状态文件',
        writeReasoningStateHint: '在工作区写入 AGENT_REASONING_STATE.json（只保存提炼状态，不保存原文）。',
        loopThreshold: '循环判定阈值',
        loopThresholdHint: '连续多少次无新证据的相似推理后判定为循环；范围 2–10。',
        toolRepeatThreshold: '重复调用阈值',
        toolRepeatThresholdHint: '相同工具与参数连续出现多少次后判定为重复；范围 2–10。',
        writeIndex: '写入磁盘索引',
        writeIndexHint: '在 DSH 会话目录写入 AGENT_CONTEXT_INDEX.md。',
        maxCardChars: '索引卡最大字符数',
        maxCardCharsHint: '每轮注入的紧凑记忆卡上限；范围 500–20000。',
        maxReasoningQuestions: '思考疑问条数上限',
        maxReasoningQuestionsHint: '同一轮最多登记多少条未解决疑问；范围 1–64。',
        memoryTextMax: '记忆条目最大字符数',
        memoryTextMaxHint: 'agents_memory 单条提炼记忆的长度上限；范围 100–2000。',
        recentMemoryMax: '近期记忆条数上限',
        recentMemoryMaxHint: '近期操作/思考保留多少条；超出后自动移除最早的。范围 3–50。',
        save: '保存',
        saving: '保存中…',
        saved: '已保存。',
        rejected: 'Host 拒绝了这次保存。',
        failed: '保存失败；请检查 Host 状态后重试。',
        reset: '重置',
        invalid: '请检查数值范围。',
        numberRange: '范围',
      },
      en: {
        nav: 'Agents Guard',
        title: 'Agents Guard',
        subtitle: 'Maintains a session index and blocks writes while a reasoning question is unresolved.',
        workflowGroup: 'Task and change management',
        workflowGroupHint: 'Task authorization, evidence, change plans, verification, and recovery.',
        continuityGroup: 'Context continuity',
        continuityGroupHint: 'Step handoffs, continuity cards, pre-compression checks, and resume.',
        reasoningGroup: 'Reasoning checks',
        reasoningGroupHint: 'Ambiguity, loops, risk, and goal-drift checks.',
        memoryGroup: 'Memory and index maintenance',
        memoryGroupHint: 'Memory recall, experience recording, and index maintenance.',
        groupOn: 'On',
        groupOff: 'Off',
        groupPartial: 'Partially on',
        advancedOptions: 'Advanced options',
        devTitle: 'Development and diagnostics',
        devHint: 'Developer mode, self-test, capability status, and diagnostics.',
        devNote: 'Collapsed by default and not part of normal feature configuration; use agents_guard_dev for self-test and capability status.',
        developerMode: 'Developer mode (testing)',
        developerModeHint: 'Bypasses all gates for regression testing. Enable only while testing; turn it off for normal use.',
        permissionTitle: 'Read permission (read-only)',
        permissionTag: 'DSH managed',
        permissionSummary: 'DSH-managed; agents_verify inherits the session policy through workspaceFiles.',
        configTitle: 'Guard policy',
        configHint: 'Saving writes the current plugin row configuration immediately; the Guard reads the new values on the next guarded call.',
        rowSummary: 'Maintains the index and blocks writes while a reasoning question is unresolved.',
        rowHint: 'Guard policy comes from the current plugin row configuration. Saves are written immediately and read on the next guarded call.',
        advancedNote: 'Other limits (entry caps, tool lists) remain in the plugin configuration; this page edits the common policies only.',
        loading: 'Loading configuration…',
        unavailable: 'This Host does not expose this configuration to the client.',
        readOnly: 'This configuration is read-only.',
        enabledHint: 'Read permission is not configured here.',
        compressPressureRatio: 'Forced-compression threshold',
        compressPressureRatioHint: 'When context pressure reaches this fraction, compression is allowed even if the card is missing or a gate is unresolved. Range 0.05–1.',
        recallGate: 'Recall-first gate',
        recallGateHint: 'Recall/history requests must call agents_index before session search is used as a fallback.',
        recordGate: 'Record-first gate',
        recordGateHint: 'After a requirement/correction/decision, record a distilled conclusion with agents_memory before writes or compression.',
        taskGate: 'Task-authorization gate',
        taskGateHint: 'Requires a user-confirmed task scope before mutations; a proposal is not authorization, and out-of-scope or excluded paths are blocked.',
        evidenceGate: 'Evidence gate',
        evidenceGateHint: 'Verified/decision memory must cite a recorded agents_evidence entry.',
        impactGate: 'Impact and invariants gate',
        impactGateHint: 'Requires an agents_change plan with direct/indirect impact and explicit invariants before mutations.',
        verificationGate: 'Change verification gate',
        verificationGateHint: 'Requires at least one recorded passing agents_check before a change can be marked verified.',
        recoveryGate: 'Recovery-point gate',
        recoveryGateHint: 'Requires an agents_recovery baseline (copy, commit, or restore point) before high-impact writes.',
        indexGate: 'Index-integrity gate',
        indexGateHint: 'Requires agents_index action=audit to pass before compression.',
        continuityGate: 'Continuity-card gate',
        continuityGateHint: 'Requires a current agents_handoff before compression; at 80% the host capsule may allow an emergency compression.',
        writeContinuity: 'Write continuity file',
        writeContinuityHint: 'Writes AGENT_CONTINUITY.md in the workspace for post-compression resume.',
        continuityMaxChars: 'Maximum continuity characters',
        continuityMaxCharsHint: 'Capsule length cap; range 300-4000.',
        maxEvidence: 'Maximum evidence entries',
        maxEvidenceHint: 'Cap on structured evidence kept for the session. Range 1–100.',
        reasoningGate: 'Reasoning-question gate',
        reasoningGateHint: 'Blocks writes while reasoning contains an unresolved question; read-only tools and read-only run_code remain available.',
        reasoningRiskGate: 'Reasoning-risk gate',
        reasoningRiskGateHint: 'Requires a GUARD_STATE self-report before writes when a loop, repeated call, or explicit goal drift is detected.',
        semanticReview: 'Independent semantic review',
        semanticReviewHint: 'Calls the current model once when a risk signal appears; this adds one model request.',
        writeReasoningState: 'Write the reasoning-state file',
        writeReasoningStateHint: 'Writes AGENT_REASONING_STATE.json in the workspace (distilled state only, never the raw transcript).',
        loopThreshold: 'Loop threshold',
        loopThresholdHint: 'Consecutive similar reasoning steps without new evidence before a loop is declared. Range 2–10.',
        toolRepeatThreshold: 'Repeated-call threshold',
        toolRepeatThresholdHint: 'Consecutive identical tool calls before a repeat is declared. Range 2–10.',
        writeIndex: 'Write the Markdown index',
        writeIndexHint: 'Writes AGENT_CONTEXT_INDEX.md under the DSH session directory.',
        maxCardChars: 'Maximum card characters',
        maxCardCharsHint: 'Cap for the compact memory card injected each turn. Range 500–20000.',
        maxReasoningQuestions: 'Maximum reasoning questions',
        maxReasoningQuestionsHint: 'How many unresolved questions one turn may register. Range 1–64.',
        memoryTextMax: 'Maximum memory characters',
        memoryTextMaxHint: 'Length cap for one distilled agents_memory entry. Range 100–2000.',
        recentMemoryMax: 'Recent memory entries',
        recentMemoryMaxHint: 'How many recent operation/thought entries to keep; the oldest is dropped first. Range 3–50.',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved.',
        rejected: 'The Host rejected this save.',
        failed: 'Save failed; check the Host state and retry.',
        reset: 'Reset',
        invalid: 'Check the numeric ranges.',
        numberRange: 'Range',
      },
    };

    const EMPTY = { status: 'unavailable', value: undefined, writable: false, revision: undefined };
    const BOOLEAN_FIELDS = [
      { key: 'developerMode', label: 'developerMode', hint: 'developerModeHint' },
      { key: 'recallGate', label: 'recallGate', hint: 'recallGateHint' },
      { key: 'recordGate', label: 'recordGate', hint: 'recordGateHint' },
      { key: 'taskGate', label: 'taskGate', hint: 'taskGateHint' },
      { key: 'evidenceGate', label: 'evidenceGate', hint: 'evidenceGateHint' },
      { key: 'impactGate', label: 'impactGate', hint: 'impactGateHint' },
      { key: 'verificationGate', label: 'verificationGate', hint: 'verificationGateHint' },
      { key: 'recoveryGate', label: 'recoveryGate', hint: 'recoveryGateHint' },
      { key: 'indexGate', label: 'indexGate', hint: 'indexGateHint' },
      { key: 'continuityGate', label: 'continuityGate', hint: 'continuityGateHint' },
      { key: 'writeContinuity', label: 'writeContinuity', hint: 'writeContinuityHint' },
      { key: 'reasoningGate', label: 'reasoningGate', hint: 'reasoningGateHint' },
      { key: 'reasoningRiskGate', label: 'reasoningRiskGate', hint: 'reasoningRiskGateHint' },
      { key: 'semanticReview', label: 'semanticReview', hint: 'semanticReviewHint' },
      { key: 'writeReasoningState', label: 'writeReasoningState', hint: 'writeReasoningStateHint' },
      { key: 'writeIndex', label: 'writeIndex', hint: 'writeIndexHint' },
    ];
    const NUMBER_FIELDS = [
      { key: 'compressPressureRatio', label: 'compressPressureRatio', hint: 'compressPressureRatioHint', min: 0.05, max: 1, step: 0.05 },
      { key: 'maxCardChars', label: 'maxCardChars', hint: 'maxCardCharsHint', min: 500, max: 20000, step: 100 },
      { key: 'maxReasoningQuestions', label: 'maxReasoningQuestions', hint: 'maxReasoningQuestionsHint', min: 1, max: 64, step: 1 },
      { key: 'memoryTextMax', label: 'memoryTextMax', hint: 'memoryTextMaxHint', min: 100, max: 2000, step: 100 },
      { key: 'recentMemoryMax', label: 'recentMemoryMax', hint: 'recentMemoryMaxHint', min: 3, max: 50, step: 1 },
      { key: 'maxEvidence', label: 'maxEvidence', hint: 'maxEvidenceHint', min: 1, max: 100, step: 1 },
      { key: 'continuityMaxChars', label: 'continuityMaxChars', hint: 'continuityMaxCharsHint', min: 300, max: 4000, step: 100 },
      { key: 'loopThreshold', label: 'loopThreshold', hint: 'loopThresholdHint', min: 2, max: 10, step: 1 },
      { key: 'toolRepeatThreshold', label: 'toolRepeatThreshold', hint: 'toolRepeatThresholdHint', min: 2, max: 10, step: 1 },
    ];
    const GROUPS = [
      { key: 'workflowEnabled', label: 'workflowGroup', hint: 'workflowGroupHint', children: ['taskGate', 'evidenceGate', 'impactGate', 'verificationGate', 'recoveryGate'], numbers: ['maxEvidence'] },
      { key: 'continuityEnabled', label: 'continuityGroup', hint: 'continuityGroupHint', children: ['continuityGate', 'writeContinuity'], numbers: ['compressPressureRatio', 'continuityMaxChars'] },
      { key: 'reasoningEnabled', label: 'reasoningGroup', hint: 'reasoningGroupHint', children: ['reasoningGate', 'reasoningRiskGate', 'semanticReview', 'writeReasoningState'], numbers: ['maxReasoningQuestions', 'loopThreshold', 'toolRepeatThreshold'] },
      { key: 'memoryEnabled', label: 'memoryGroup', hint: 'memoryGroupHint', children: ['recallGate', 'recordGate', 'indexGate', 'writeIndex'], numbers: ['memoryTextMax', 'recentMemoryMax', 'maxCardChars'] },
    ];
    const GROUP_DEFAULTS = {
      workflowEnabled: false,
      continuityEnabled: true,
      reasoningEnabled: true,
      memoryEnabled: true,
    };
    const GROUP_FIELDS = GROUPS.map(group => ({ key: group.key, label: group.label, hint: group.hint }));
    const FIELD_BY_KEY = new Map(BOOLEAN_FIELDS.concat(NUMBER_FIELDS).map(field => [field.key, field]));
    const ALL_FIELDS = GROUP_FIELDS.concat(BOOLEAN_FIELDS, NUMBER_FIELDS);
    const NUMERIC_FIELDS = new Set(NUMBER_FIELDS.map(field => field.key));

    const pageStyle = { display: 'grid', gap: '18px', maxWidth: '760px', color: 'var(--dsw-alias-label-primary)' };
    const headerStyle = { display: 'grid', gap: '6px' };
    const titleStyle = { margin: 0, fontSize: '20px', lineHeight: 1.25 };
    const subtitleStyle = { margin: 0, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.55 };
    const cardStyle = {
      display: 'grid',
      gap: '14px',
      padding: '16px',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: '10px',
      background: 'var(--dsw-alias-bg-layer-2)',
    };
    const permissionStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      minWidth: 0,
      padding: '7px 10px',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: '8px',
      background: 'var(--dsw-alias-bg-layer-2)',
    };
    const permissionTitleStyle = { margin: 0, fontSize: '12px', fontWeight: 600, lineHeight: 1.35, whiteSpace: 'nowrap' };
    const permissionTagStyle = {
      flex: '0 0 auto',
      fontSize: '10px',
      lineHeight: 1.4,
      padding: '1px 6px',
      borderRadius: '999px',
      border: '1px solid var(--dsw-alias-border-l2)',
      color: 'var(--dsw-alias-label-secondary)',
      whiteSpace: 'nowrap',
    };
    const permissionTextStyle = {
      minWidth: 0,
      margin: 0,
      flex: '1 1 auto',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      color: 'var(--dsw-alias-label-secondary)',
      fontSize: '12px',
      lineHeight: 1.45,
    };
    const sectionTitleStyle = { margin: 0, fontSize: '15px', lineHeight: 1.35 };
    const groupHeaderStyle = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' };
    const groupControlStyle = { display: 'flex', alignItems: 'center', gap: '10px', flex: '0 0 auto' };
    const groupStatusStyle = { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap' };
    const groupSwitchStyle = { width: '20px', height: '20px', margin: 0, accentColor: 'var(--dsw-alias-brand-primary)' };
    const advancedStyle = { borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: '10px' };
    const summaryStyle = { cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)', fontSize: '12px', fontWeight: 600, lineHeight: 1.5 };
    const advancedBodyStyle = { display: 'grid', gap: '12px', paddingTop: '12px' };
    const noteStyle = { margin: 0, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.55, fontSize: '13px' };
    const rowStyle = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' };
    const rowTextStyle = { display: 'grid', gap: '4px', minWidth: 0 };
    const rowLabelStyle = { fontWeight: 600, lineHeight: 1.4 };
    const hintStyle = { margin: 0, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.45, fontSize: '12px' };
    const inputStyle = {
      width: '150px',
      boxSizing: 'border-box',
      padding: '7px 9px',
      borderRadius: '6px',
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'var(--dsw-alias-bg-base)',
      color: 'inherit',
      font: 'inherit',
    };
    const actionsStyle = { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' };
    const primaryStyle = {
      border: 0,
      borderRadius: '7px',
      padding: '8px 14px',
      font: 'inherit',
      fontWeight: 600,
      cursor: 'pointer',
      background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary))',
      color: 'var(--dsw-alias-label-primary-foreground, #fff)',
    };
    // 禁用态不用 opacity 压淡：那会把文字和底色一起变浅，对比度反而更差。
    // 改为中性底色 + 三级文字，既表示不可点，又保证文字可读。
    const primaryDisabledStyle = {
      background: 'var(--dsw-alias-bg-layer-3)',
      color: 'var(--dsw-alias-label-tertiary)',
      cursor: 'default',
      boxShadow: 'inset 0 0 0 1px var(--dsw-alias-border-l2)',
    };
    const secondaryStyle = {
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: '7px',
      padding: '7px 12px',
      font: 'inherit',
      cursor: 'pointer',
      background: 'transparent',
      color: 'inherit',
    };
    const messageStyle = { margin: 0, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5, fontSize: '13px' };
    const errorStyle = { margin: 0, color: 'var(--dsw-alias-state-error-primary)', lineHeight: 1.5, fontSize: '13px' };

    function snapshotOf(form) {
      if (!form) return EMPTY;
      try {
        if (typeof form.getSnapshot === 'function') return form.getSnapshot() || EMPTY;
        if (form.state) return form.state;
      } catch {}
      return EMPTY;
    }

    function useSnapshot(form) {
      const subscribe = React.useCallback(listener => {
        if (form && typeof form.subscribe === 'function') return form.subscribe(listener);
        return () => {};
      }, [form]);
      const read = React.useCallback(() => snapshotOf(form), [form]);
      return React.useSyncExternalStore(subscribe, read, read);
    }

    function readDraft(value, user) {
      const base = value && typeof value === 'object' ? value : {};
      const explicit = user && typeof user === 'object' ? user : {};
      // The form must display the same effective input the Guard reads. If
      // the Host's value layer lags behind the user layer, showing only
      // value makes a successful save look like it was ignored.
      const source = Object.assign({}, base, explicit);
      const hasGroup = key => Object.prototype.hasOwnProperty.call(explicit, key);
      // An explicit user group switch is authoritative even when the Host omits
      // the group field from `value`; only a profile without the field derives
      // the group from its old child switches.
      const boolValue = value => typeof value === 'string'
        ? !/^(false|0|no|off|)$/i.test(value.trim())
        : Boolean(value);
      const groupValue = (key, children) => hasGroup(key)
        ? boolValue(explicit[key])
        : children.some(child => Object.prototype.hasOwnProperty.call(source, child))
          ? children.some(child => source[child] !== false)
          : GROUP_DEFAULTS[key] !== false;
      const ratio = Number(source.compressPressureRatio);
      const card = Number(source.maxCardChars);
      const questions = Number(source.maxReasoningQuestions);
      const memory = Number(source.memoryTextMax);
      const recent = Number(source.recentMemoryMax);
      const loop = Number(source.loopThreshold);
      const repeats = Number(source.toolRepeatThreshold);
      const evidenceMax = Number(source.maxEvidence);
      const continuityMax = Number(source.continuityMaxChars);
      return {
        developerMode: source.developerMode === true,
        workflowEnabled: groupValue('workflowEnabled', GROUPS[0].children),
        continuityEnabled: groupValue('continuityEnabled', GROUPS[1].children),
        reasoningEnabled: groupValue('reasoningEnabled', GROUPS[2].children),
        memoryEnabled: groupValue('memoryEnabled', GROUPS[3].children),
        recallGate: source.recallGate !== false,
        recordGate: source.recordGate !== false,
        taskGate: source.taskGate === true,
        evidenceGate: source.evidenceGate === true,
        impactGate: source.impactGate === true,
        verificationGate: source.verificationGate === true,
        recoveryGate: source.recoveryGate === true,
        indexGate: source.indexGate === true,
        continuityGate: source.continuityGate !== false,
        writeContinuity: source.writeContinuity !== false,
        reasoningGate: source.reasoningGate !== false,
        reasoningRiskGate: source.reasoningRiskGate !== false,
        semanticReview: source.semanticReview !== false,
        writeReasoningState: source.writeReasoningState !== false,
        writeIndex: source.writeIndex !== false,
        compressPressureRatio: Number.isFinite(ratio) ? ratio : 0.8,
        maxCardChars: Number.isFinite(card) ? card : 4200,
        maxReasoningQuestions: Number.isFinite(questions) && questions >= 1 && questions <= 64 ? questions : 8,
        memoryTextMax: Number.isFinite(memory) ? memory : 600,
        recentMemoryMax: Number.isFinite(recent) ? recent : 12,
        maxEvidence: Number.isFinite(evidenceMax) ? evidenceMax : 20,
        continuityMaxChars: Number.isFinite(continuityMax) && continuityMax >= 300 && continuityMax <= 4000 ? continuityMax : 1600,
        loopThreshold: Number.isFinite(loop) ? loop : 2,
        toolRepeatThreshold: Number.isFinite(repeats) ? repeats : 3,
      };
    }

    function sameDraft(a, b) {
      for (const field of ALL_FIELDS) {
        if (a[field.key] !== b[field.key]) return false;
      }
      return true;
    }

    function validDraft(draft) {
      const ratio = Number(draft.compressPressureRatio);
      const card = Number(draft.maxCardChars);
      const questions = Number(draft.maxReasoningQuestions);
      const memory = Number(draft.memoryTextMax);
      const recent = Number(draft.recentMemoryMax);
      const loop = Number(draft.loopThreshold);
      const repeats = Number(draft.toolRepeatThreshold);
      const evidenceMax = Number(draft.maxEvidence);
      const continuityMax = Number(draft.continuityMaxChars);
      return Number.isFinite(ratio) && ratio >= 0.05 && ratio <= 1 &&
        Number.isFinite(card) && card >= 500 && card <= 20000 &&
        Number.isFinite(questions) && questions >= 1 && questions <= 64 &&
        Number.isFinite(memory) && memory >= 100 && memory <= 2000 &&
        Number.isFinite(recent) && recent >= 3 && recent <= 50 &&
        Number.isFinite(loop) && loop >= 2 && loop <= 10 &&
        Number.isFinite(repeats) && repeats >= 2 && repeats <= 10 &&
        Number.isFinite(evidenceMax) && evidenceMax >= 1 && evidenceMax <= 100 &&
        Number.isFinite(continuityMax) && continuityMax >= 300 && continuityMax <= 4000;
    }

    function PermissionCard({ t }) {
      const summary = t('permissionSummary');
      return h('section', { style: permissionStyle, 'aria-label': t('permissionTitle'), title: summary },
        h('h3', { style: permissionTitleStyle }, t('permissionTitle')),
        h('span', { style: permissionTagStyle }, t('permissionTag')),
        h('span', { style: permissionTextStyle }, summary));
    }

    function NumberField({ field, draft, disabled, edit, t }) {
      return h('div', { style: rowStyle },
        h('div', { style: rowTextStyle },
          h('label', { style: rowLabelStyle, htmlFor: 'agents-guard-' + field.key }, t(field.label)),
          h('p', { style: hintStyle }, t(field.hint))),
        h('input', {
          id: 'agents-guard-' + field.key,
          type: 'number',
          min: field.min,
          max: field.max,
          step: field.step,
          value: draft[field.key],
          disabled,
          style: inputStyle,
          onChange: event => {
            const value = event.target.value === '' ? '' : Number(event.target.value);
            edit(field.key, value);
          },
        }));
    }

    function groupStatus(draft, group) {
      if (draft[group.key] === false) return 'off';
      return group.children.every(key => draft[key]) ? 'on' : 'partial';
    }

    function GroupCard({ group, draft, disabled, edit, t }) {
      const status = groupStatus(draft, group);
      const statusText = status === 'on' ? 'groupOn' : status === 'off' ? 'groupOff' : 'groupPartial';
      return h('section', { style: cardStyle, 'aria-label': t(group.label) },
        h('div', { style: groupHeaderStyle },
          h('div', { style: rowTextStyle },
            h('h3', { style: sectionTitleStyle }, t(group.label)),
            h('p', { style: hintStyle }, t(group.hint))),
          h('div', { style: groupControlStyle },
            h('span', { style: groupStatusStyle }, t(statusText)),
            h('input', {
              id: 'agents-guard-' + group.key,
              type: 'checkbox',
              checked: Boolean(draft[group.key]),
              disabled,
              'aria-label': t(group.label),
              style: groupSwitchStyle,
              onChange: event => edit(group.key, event.target.checked),
            }))),
        h('details', { style: advancedStyle },
          h('summary', { style: summaryStyle }, t('advancedOptions')),
          h('div', { style: advancedBodyStyle },
            group.children.map(key => {
              const field = FIELD_BY_KEY.get(key);
              return field ? h(BooleanField, { key, field, draft, disabled, edit, t }) : null;
            }),
            (group.numbers || []).map(key => {
              const field = FIELD_BY_KEY.get(key);
              return field ? h(NumberField, { key, field, draft, disabled, edit, t }) : null;
            }))));
    }

    function DeveloperCard({ draft, disabled, edit, t }) {
      const field = FIELD_BY_KEY.get('developerMode');
      return h('section', { style: cardStyle, 'aria-label': t('devTitle') },
        h('details', { style: advancedStyle },
          h('summary', { style: summaryStyle }, t('devTitle')),
          h('div', { style: advancedBodyStyle },
            h('p', { style: hintStyle }, t('devHint')),
            field ? h(BooleanField, { field, draft, disabled, edit, t }) : null,
            h('p', { style: hintStyle }, t('devNote')))));
    }

    function BooleanField({ field, draft, disabled, edit, t }) {
      return h('div', { style: rowStyle },
        h('div', { style: rowTextStyle },
          h('label', { style: rowLabelStyle, htmlFor: 'agents-guard-' + field.key }, t(field.label)),
          h('p', { style: hintStyle }, t(field.hint))),
        h('input', {
          id: 'agents-guard-' + field.key,
          type: 'checkbox',
          checked: Boolean(draft[field.key]),
          disabled,
          style: { width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--dsw-alias-brand-primary)' },
          onChange: event => edit(field.key, event.target.checked),
        }));
    }

    function ConfigControls({ form, t }) {
      const state = useSnapshot(form);
      const [draft, setDraft] = React.useState(() => readDraft(state.value, state.user));
      const [baseline, setBaseline] = React.useState(() => readDraft(state.value, state.user));
      const [dirty, setDirty] = React.useState(false);
      const [saving, setSaving] = React.useState(false);
      const [message, setMessage] = React.useState('');
      const [failed, setFailed] = React.useState(false);
      const dirtyRef = React.useRef(false);

      React.useEffect(() => {
        if (dirtyRef.current) return;
        const next = readDraft(state.value, state.user);
        setDraft(next);
        setBaseline(next);
      }, [state.value, state.user, state.revision]);

      if (!form) return h('p', { style: noteStyle }, t('rowHint'));
      if (state.status === 'loading') return h('p', { style: noteStyle, role: 'status' }, t('loading'));
      if (state.status === 'unavailable' || (!state.value && !state.user)) {
        return h('p', { style: noteStyle, role: 'status' }, t('unavailable'));
      }

      const writable = state.writable !== false;
      const disabled = !writable || saving;
      const valid = validDraft(draft);

      function edit(key, value) {
        dirtyRef.current = true;
        setDirty(true);
        setFailed(false);
        setMessage('');
        setDraft(previous => Object.assign({}, previous, { [key]: value }));
      }

      function reset() {
        dirtyRef.current = false;
        setDirty(false);
        setFailed(false);
        setMessage('');
        setDraft(baseline);
      }

      async function save(event) {
        event.preventDefault();
        if (!form || !writable || saving || !valid) return;
        const operations = [];
        for (const field of ALL_FIELDS) {
          const value = NUMERIC_FIELDS.has(field.key) ? Number(draft[field.key]) : Boolean(draft[field.key]);
          if (value !== baseline[field.key]) operations.push({ op: 'set', path: [field.key], value });
        }
        if (operations.length === 0) {
          dirtyRef.current = false;
          setDirty(false);
          return;
        }
        setSaving(true);
        setFailed(false);
        setMessage('');
        try {
          const accepted = await form.mutate(operations, state.revision);
          if (!accepted) {
            setFailed(true);
            setMessage('rejected');
            return;
          }
          dirtyRef.current = false;
          setDirty(false);
          setBaseline(draft);
          setMessage('saved');
        } catch (error) {
          setFailed(true);
          setMessage('failed');
        } finally {
          setSaving(false);
        }
      }

      return h('form', { style: { display: 'grid', gap: '16px' }, onSubmit: save },
        GROUPS.map(group => h(GroupCard, { key: group.key, group, draft, disabled, edit, t })),
        h(DeveloperCard, { draft, disabled, edit, t }),
        !writable ? h('p', { style: noteStyle, role: 'status' }, t('readOnly')) : null,
        !valid ? h('p', { style: errorStyle, role: 'alert' }, t('invalid')) : null,
        h('div', { style: actionsStyle },
          h('button', { type: 'submit', disabled: disabled || !dirty || !valid, style: Object.assign({}, primaryStyle, disabled || !dirty || !valid ? primaryDisabledStyle : null) }, t(saving ? 'saving' : 'save')),
          h('button', { type: 'button', disabled: disabled || !dirty, onClick: reset, style: secondaryStyle }, t('reset'))),
        message ? h('p', { style: failed ? errorStyle : messageStyle, role: failed ? 'alert' : 'status' }, t(message)) : null);
    }

    function SettingsPage({ form, t }) {
      return h('div', { style: pageStyle },
        h('header', { style: headerStyle },
          h('h2', { style: titleStyle }, t('title')),
          h('p', { style: subtitleStyle }, t('subtitle'))),
        h('section', { style: cardStyle, 'aria-label': t('configTitle') },
          h('h3', { style: sectionTitleStyle }, t('configTitle')),
          h('p', { style: hintStyle }, t('configHint')),
          h(ConfigControls, { form, t })),
        h(PermissionCard, { t }),
        h('p', { style: hintStyle }, t('advancedNote')));
    }

    function RowConfig({ form, t, view }) {
      if (view === 'summary') return h('span', null, t('rowSummary'));
      return h('div', { style: pageStyle },
        h('section', { style: cardStyle, 'aria-label': t('configTitle') },
          h('h3', { style: sectionTitleStyle }, t('configTitle')),
          h('p', { style: hintStyle }, t('configHint')),
          h(ConfigControls, { form, t })),
        h('p', { style: hintStyle }, t('advancedNote')));
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-agents-guard: client dictionaries');
      const t = ctx.locale.bind(NS);
      let form;
      try {
        const configForms = ctx.get ? ctx.get('configForms') : undefined;
        form = configForms && typeof configForms.get === 'function' ? configForms.get(ENTRY_ID) : undefined;
      } catch {
        form = undefined;
      }
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'agents-guard',
        order: 45,
        label: () => t('nav'),
        locale: NS,
      }, props => h(SettingsPage, { form, t: props.t || t })));
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: '@local/dsh-agents-guard#agents-guard',
        locale: NS,
      }, props => h(RowConfig, { form: props.form, t: props.t || t, view: props.view })));
    }

    return { inject, apply };
  },
  });
  } catch (error) {
    const message = String((error && error.message) || error);
    if (!/duplicate factory registration/.test(message)) throw error;
    try {
      console.warn('[dsh-agents-guard] duplicate client registration ignored; keeping the first factory:', message);
    } catch {}
  }
})();
