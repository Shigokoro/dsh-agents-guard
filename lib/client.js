window.__ModuleLoader__.load({
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
        subtitle: '维护会话索引，并在歧义或未解决疑问时阻止修改。',
        permissionTitle: '读取权限（只读）',
        permissionTag: 'DSH 托管',
        permissionSummary: '由 DSH 统一管理；agents_verify 通过 workspaceFiles 继承当前会话权限。',
        configTitle: 'Guard 自有策略',
        configHint: '保存后写入当前插件行配置；部分策略在下一个会话生效。',
        rowSummary: '维护索引，并阻止在歧义或未解决疑问时修改。',
        rowHint: 'Guard 自有策略来自当前插件行配置；保存后立即写入，部分策略在下一个会话生效。',
        advancedNote: '其余限制参数（条目上限、工具名单等）保留在插件配置中；本页只编辑常用策略。',
        loading: '正在读取配置…',
        unavailable: '当前 Host 没有向客户端提供这份配置。',
        readOnly: '当前配置只读。',
        enabledHint: '读取权限不在此处配置。',
        compressPressureRatio: '强制压缩阈值',
        compressPressureRatioHint: '上下文压力达到该比例时，即使索引卡缺失或闸门未解决也允许压缩。范围 0.05–1。',
        ambiguityGate: '歧义闸门',
        ambiguityGateHint: '最新用户消息是强歧义问句时，阻止修改，直到提问或用户澄清。',
        reasoningGate: '思考疑问闸门',
        reasoningGateHint: '推理中存在未解决疑问时，阻止修改，直到只读验证或提问解决。',
        writeIndex: '写入磁盘索引',
        writeIndexHint: '在 DSH 会话目录写入 AGENT_CONTEXT_INDEX.md。',
        maxCardChars: '索引卡最大字符数',
        maxCardCharsHint: '每轮注入的紧凑记忆卡上限；范围 500–20000。',
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
        subtitle: 'Maintains a session index and blocks mutation while an ambiguity or reasoning question is unresolved.',
        permissionTitle: 'Read permission (read-only)',
        permissionTag: 'DSH managed',
        permissionSummary: 'DSH-managed; agents_verify inherits the session policy through workspaceFiles.',
        configTitle: 'Guard policy',
        configHint: 'Saving writes the current plugin row configuration; some policies take effect in the next session.',
        rowSummary: 'Maintains the index and blocks mutation while an ambiguity or reasoning question is unresolved.',
        rowHint: 'Guard policy comes from the current plugin row configuration. Saves are written immediately; some policies take effect in the next session.',
        advancedNote: 'Other limits (entry caps, tool lists) remain in the plugin configuration; this page edits the common policies only.',
        loading: 'Loading configuration…',
        unavailable: 'This Host does not expose this configuration to the client.',
        readOnly: 'This configuration is read-only.',
        enabledHint: 'Read permission is not configured here.',
        compressPressureRatio: 'Forced-compression threshold',
        compressPressureRatioHint: 'When context pressure reaches this fraction, compression is allowed even if the card is missing or a gate is unresolved. Range 0.05–1.',
        ambiguityGate: 'Ambiguity gate',
        ambiguityGateHint: 'Blocks mutation while the latest user message is a strong ambiguous question, until you ask or the user clarifies.',
        reasoningGate: 'Reasoning-question gate',
        reasoningGateHint: 'Blocks mutation while reasoning contains an unresolved question, until read-only verification or a user answer resolves it.',
        writeIndex: 'Write the Markdown index',
        writeIndexHint: 'Writes AGENT_CONTEXT_INDEX.md under the DSH session directory.',
        maxCardChars: 'Maximum card characters',
        maxCardCharsHint: 'Cap for the compact memory card injected each turn. Range 500–20000.',
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
      { key: 'ambiguityGate', label: 'ambiguityGate', hint: 'ambiguityGateHint' },
      { key: 'reasoningGate', label: 'reasoningGate', hint: 'reasoningGateHint' },
      { key: 'writeIndex', label: 'writeIndex', hint: 'writeIndexHint' },
    ];
    const NUMBER_FIELDS = [
      { key: 'compressPressureRatio', label: 'compressPressureRatio', hint: 'compressPressureRatioHint', min: 0.05, max: 1, step: 0.05 },
      { key: 'maxCardChars', label: 'maxCardChars', hint: 'maxCardCharsHint', min: 500, max: 20000, step: 100 },
    ];
    const ALL_FIELDS = BOOLEAN_FIELDS.concat(NUMBER_FIELDS);

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
      background: 'var(--dsw-alias-bg-layer-3)',
    };
    const permissionStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      minWidth: 0,
      padding: '7px 10px',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: '8px',
      background: 'var(--dsw-alias-bg-layer-3)',
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
      color: 'var(--dsw-alias-label-tertiary)',
      fontSize: '12px',
      lineHeight: 1.45,
    };
    const sectionTitleStyle = { margin: 0, fontSize: '15px', lineHeight: 1.35 };
    const noteStyle = { margin: 0, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.55, fontSize: '13px' };
    const rowStyle = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' };
    const rowTextStyle = { display: 'grid', gap: '4px', minWidth: 0 };
    const rowLabelStyle = { fontWeight: 600, lineHeight: 1.4 };
    const hintStyle = { margin: 0, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.45, fontSize: '12px' };
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
      background: 'var(--dsw-alias-state-business-primary)',
      color: '#fff',
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

    function readDraft(value) {
      const source = value && typeof value === 'object' ? value : {};
      const ratio = Number(source.compressPressureRatio);
      const card = Number(source.maxCardChars);
      return {
        ambiguityGate: source.ambiguityGate !== false,
        reasoningGate: source.reasoningGate !== false,
        writeIndex: source.writeIndex !== false,
        compressPressureRatio: Number.isFinite(ratio) ? ratio : 0.8,
        maxCardChars: Number.isFinite(card) ? card : 4200,
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
      return Number.isFinite(ratio) && ratio >= 0.05 && ratio <= 1 &&
        Number.isFinite(card) && card >= 500 && card <= 20000;
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
          style: { width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--dsw-alias-state-business-primary)' },
          onChange: event => edit(field.key, event.target.checked),
        }));
    }

    function ConfigControls({ form, t }) {
      const state = useSnapshot(form);
      const [draft, setDraft] = React.useState(() => readDraft(state.value));
      const [baseline, setBaseline] = React.useState(() => readDraft(state.value));
      const [dirty, setDirty] = React.useState(false);
      const [saving, setSaving] = React.useState(false);
      const [message, setMessage] = React.useState('');
      const [failed, setFailed] = React.useState(false);
      const dirtyRef = React.useRef(false);

      React.useEffect(() => {
        if (dirtyRef.current) return;
        const next = readDraft(state.value);
        setDraft(next);
        setBaseline(next);
      }, [state.value, state.revision]);

      if (!form) return h('p', { style: noteStyle }, t('rowHint'));
      if (state.status === 'loading') return h('p', { style: noteStyle, role: 'status' }, t('loading'));
      if (state.status === 'unavailable' || !state.value) {
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
          const value = field.key === 'maxCardChars' || field.key === 'compressPressureRatio'
            ? Number(draft[field.key])
            : Boolean(draft[field.key]);
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
        BOOLEAN_FIELDS.map(field => h(BooleanField, { key: field.key, field, draft, disabled, edit, t })),
        NUMBER_FIELDS.map(field => h(NumberField, { key: field.key, field, draft, disabled, edit, t })),
        !writable ? h('p', { style: noteStyle, role: 'status' }, t('readOnly')) : null,
        !valid ? h('p', { style: errorStyle, role: 'alert' }, t('invalid')) : null,
        h('div', { style: actionsStyle },
          h('button', { type: 'submit', disabled: disabled || !dirty || !valid, style: Object.assign({}, primaryStyle, { opacity: disabled || !dirty || !valid ? 0.5 : 1, cursor: disabled || !dirty || !valid ? 'default' : 'pointer' }) }, t(saving ? 'saving' : 'save')),
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
