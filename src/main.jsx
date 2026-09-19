import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

/* ---------- 规则 ---------- */
const RULE = {
  DATE_ORDER: 'RULE-01 · 章节日期不得早于上一章',
  DATE_NEXT: 'RULE-02 · 章节日期不得晚于下一章',
  NO_PARTICIPANT: 'RULE-03 · 未选择参与角色不能保存',
  DEPARTED: 'RULE-04 · 离队角色不能参与离队当日及之后的章节',
  REASON: 'RULE-05 · 修改已冻结内容必须填写修订原因',
  DEPART_CONFLICT: 'RULE-06 · 离队日期不能早于该角色已参与的章节日期',
};

const STORE_KEY = 'campaign-log-v2';

const seed = {
  name: '暮光边境',
  system: 'D&D 5E',
  chapters: [
    {id: 1, seq: 1, title: '第一章：灰港的钟声', tag: '主线', color: '#d8a153', versions: [
      {v: 1, date: '2024-06-08', summary: '队伍抵达灰港，在失落的钟楼发现了神秘符文。', participants: ['艾德里安', '瑟琳', '莫尔'], reason: '初始记录', at: '2024-06-08T20:00:00'}]},
    {id: 2, seq: 2, title: '第二章：雾中来客', tag: '主线', color: '#93b7a6', versions: [
      {v: 1, date: '2024-06-15', summary: '与流浪法师伊琳结盟，追踪海雾中的脚印。', participants: ['艾德里安', '瑟琳'], reason: '初始记录', at: '2024-06-15T20:00:00'}]},
    {id: 3, seq: 3, title: '支线：深林采药', tag: '支线', color: '#b9a6d1', versions: [
      {v: 1, date: '2024-06-22', summary: '帮助村民寻找月光草，获得一枚古老铜币。', participants: ['瑟琳', '莫尔'], reason: '初始记录', at: '2024-06-22T20:00:00'}]},
  ],
  characters: [
    {name: '艾德里安', role: '圣骑士', player: '林默', color: '#d8a153', status: 'active', departedOn: null},
    {name: '瑟琳', role: '游侠', player: '安然', color: '#93b7a6', status: 'active', departedOn: null},
    {name: '莫尔', role: '术士', player: '周岳', color: '#b9a6d1', status: 'active', departedOn: null},
  ],
};

/* ---------- 领域工具 ---------- */
const cur = ch => ch.versions[ch.versions.length - 1];
const bySeq = list => [...list].sort((a, b) => a.seq - b.seq);
const sameList = (a, b) => a.length === b.length && a.every(x => b.includes(x));

/* 校验一份章节草稿（新建 selfId=null，修订时传章节 id） */
function validateDraft(data, draft, selfId = null) {
  const conflicts = [];
  const list = bySeq(data.chapters);
  const idx = selfId == null ? list.length : list.findIndex(c => c.id === selfId);
  const prev = list[idx - 1];
  const next = selfId == null ? null : list[idx + 1];
  const label = draft.title || '（未命名章节）';

  if (!draft.participants.length)
    conflicts.push({chapter: label, date: draft.date, characters: [], rule: RULE.NO_PARTICIPANT});
  if (prev && draft.date < cur(prev).date)
    conflicts.push({chapter: `${label}（上一章：${prev.title}）`, date: `${draft.date} 早于 ${cur(prev).date}`, characters: [], rule: RULE.DATE_ORDER});
  if (next && draft.date > cur(next).date)
    conflicts.push({chapter: `${label}（下一章：${next.title}）`, date: `${draft.date} 晚于 ${cur(next).date}`, characters: [], rule: RULE.DATE_NEXT});
  for (const name of draft.participants) {
    const c = data.characters.find(x => x.name === name);
    if (c && c.status === 'departed' && draft.date >= c.departedOn)
      conflicts.push({chapter: label, date: draft.date, characters: [name], rule: `${RULE.DEPARTED}（${name} 离队于 ${c.departedOn}）`});
  }
  return conflicts;
}

/* 刷新/载入时的完整性审计：章节顺序、角色状态、版本链 */
function audit(data) {
  const conflicts = [];
  const list = bySeq(data.chapters);
  list.forEach((ch, i) => {
    ch.versions.forEach((v, j) => {
      if (v.v !== j + 1)
        conflicts.push({chapter: ch.title, date: v.date, characters: v.participants, rule: 'RULE-07 · 版本链断裂，版本号不连续'});
    });
    const v = cur(ch);
    if (i > 0 && v.date < cur(list[i - 1]).date)
      conflicts.push({chapter: `${ch.title}（上一章：${list[i - 1].title}）`, date: `${v.date} 早于 ${cur(list[i - 1]).date}`, characters: v.participants, rule: RULE.DATE_ORDER});
    for (const name of v.participants) {
      const c = data.characters.find(x => x.name === name);
      if (!c)
        conflicts.push({chapter: ch.title, date: v.date, characters: [name], rule: 'RULE-08 · 参与者不在角色名册中'});
      else if (c.status === 'departed' && v.date >= c.departedOn)
        conflicts.push({chapter: ch.title, date: v.date, characters: [name], rule: `${RULE.DEPARTED}（${name} 离队于 ${c.departedOn}）`});
    }
  });
  return conflicts;
}

function read() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    if (d && Array.isArray(d.chapters) && d.chapters.every(c => Array.isArray(c.versions) && c.versions.length)) return d;
  } catch {}
  return seed;
}

/* ---------- 通用组件 ---------- */
const ConflictList = ({conflicts}) => (
  <div className="conflict-panel">
    <strong>⚠ 发现 {conflicts.length} 处冲突，操作被规则拦截</strong>
    {conflicts.map((c, i) => (
      <div className="conflict-row" key={i}>
        <div><small>章节</small><span>{c.chapter}</span></div>
        <div><small>日期</small><span>{c.date}</span></div>
        <div><small>角色</small><span>{c.characters.length ? c.characters.join('、') : '—'}</span></div>
        <div><small>触发规则</small><span>{c.rule}</span></div>
      </div>
    ))}
  </div>
);

const ParticipantPicker = ({characters, date, selected, onToggle}) => (
  <div className="picker">
    {characters.map(c => {
      const blocked = c.status === 'departed' && date >= c.departedOn;
      const on = selected.includes(c.name) && !blocked;
      return (
        <label key={c.name} className={'pick' + (blocked ? ' blocked' : '') + (on ? ' on' : '')}>
          <input type="checkbox" disabled={blocked} checked={on} onChange={() => onToggle(c.name)} />
          <span className="dot" style={{background: c.color}} />
          {c.name}
          {c.status === 'departed' && <small>离队于 {c.departedOn}</small>}
        </label>
      );
    })}
  </div>
);

const Avatar = ({data, name}) => {
  const c = data.characters.find(x => x.name === name);
  return <span className="participant"><i style={{background: c ? c.color : '#c9cfc9'}}>{name[0]}</i>{name}{c && c.status === 'departed' && <em>已离队</em>}</span>;
};

/* ---------- 章节新建 / 修订弹窗 ---------- */
function ChapterModal({data, mode, chapter, onClose, onSave}) {
  const isNew = mode === 'new';
  const v = isNew ? null : cur(chapter);
  const list = bySeq(data.chapters);
  const idx = isNew ? list.length : list.findIndex(c => c.id === chapter.id);
  const prev = list[idx - 1];
  const next = isNew ? null : list[idx + 1];

  const [title, setTitle] = useState(isNew ? '' : chapter.title);
  const [tag, setTag] = useState(isNew ? '主线' : chapter.tag);
  const [date, setDate] = useState(isNew ? (prev ? cur(prev).date : '2024-07-01') : v.date);
  const [summary, setSummary] = useState(isNew ? '' : v.summary);
  const [parts, setParts] = useState(isNew ? [] : v.participants);
  const [reason, setReason] = useState('');
  const [conflicts, setConflicts] = useState([]);

  const frozenChanged = !isNew && (date !== v.date || summary !== v.summary || !sameList(parts, v.participants));

  const changeDate = d => {
    setDate(d);
    // 日期变化后，自动移除在该日期已离队的角色
    setParts(ps => ps.filter(n => {
      const c = data.characters.find(x => x.name === n);
      return !(c && c.status === 'departed' && d >= c.departedOn);
    }));
  };
  const toggle = n => setParts(ps => ps.includes(n) ? ps.filter(x => x !== n) : [...ps, n]);

  const save = () => {
    const errs = validateDraft(data, {title, date, participants: parts}, isNew ? null : chapter.id);
    if (!isNew && frozenChanged && !reason.trim())
      errs.push({chapter: chapter.title, date, characters: [], rule: RULE.REASON});
    setConflicts(errs);
    if (!errs.length) onSave({title, tag, date, summary, participants: parts, reason: reason.trim()});
  };

  return (
    <div className="modal-bg">
      <div className="modal">
        <button className="close" onClick={onClose}>×</button>
        <span className="crumb">{isNew ? 'NEW CHAPTER' : `REVISE · 当前 v${v.v}`}</span>
        <h2>{isNew ? '记录新的章节' : `修订「${chapter.title}」`}</h2>
        {!isNew && <div className="frozen">🔒 日期、摘要与参与者保存后即冻结，修改将生成带原因的新版本，旧版本保留可查。</div>}
        <label>章节标题<input value={title} onChange={e => setTitle(e.target.value)} placeholder="例：第三章：月下集市" /></label>
        <label>游戏日期
          <input type="date" value={date} min={prev ? cur(prev).date : undefined} max={next ? cur(next).date : undefined} onChange={e => changeDate(e.target.value)} />
          {prev && <span className="hint-dim">不得早于上一章（{prev.title} · {cur(prev).date}）</span>}
        </label>
        <label>章节摘要<textarea rows="3" value={summary} onChange={e => setSummary(e.target.value)} placeholder="发生了什么？" /></label>
        <div className="field">参与角色{!parts.length && <span className="hint">至少选择一名角色，否则无法保存</span>}
          <ParticipantPicker characters={data.characters} date={date} selected={parts} onToggle={toggle} />
        </div>
        <label>章节类型
          <select value={tag} onChange={e => setTag(e.target.value)}><option>主线</option><option>支线</option><option>番外</option></select>
        </label>
        {!isNew && (
          <label>修订原因{frozenChanged ? <span className="hint">修改了冻结内容，必填</span> : <span className="hint-dim">未改动冻结内容时无需填写</span>}
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="例：更正记录错误的日期" />
          </label>
        )}
        {conflicts.length > 0 && <ConflictList conflicts={conflicts} />}
        <button className="primary full" disabled={!title || !parts.length} onClick={save}>
          {isNew ? '保存章节' : frozenChanged ? `生成新版本 v${v.v + 1}` : '保存修改'}
        </button>
      </div>
    </div>
  );
}

/* ---------- 角色离队弹窗 ---------- */
function DepartModal({data, name, onClose, onConfirm}) {
  const last = bySeq(data.chapters).slice(-1)[0];
  const [date, setDate] = useState(last ? cur(last).date : '2024-07-01');
  const [conflicts, setConflicts] = useState([]);

  const confirm = () => {
    const errs = bySeq(data.chapters)
      .filter(ch => cur(ch).date >= date && cur(ch).participants.includes(name))
      .map(ch => ({chapter: ch.title, date: cur(ch).date, characters: [name], rule: RULE.DEPART_CONFLICT}));
    setConflicts(errs);
    if (!errs.length) onConfirm(date);
  };

  return (
    <div className="modal-bg">
      <div className="modal">
        <button className="close" onClick={onClose}>×</button>
        <span className="crumb">DEPARTURE</span>
        <h2>标记「{name}」离队</h2>
        <div className="frozen">离队后，日期不早于离队日期的章节将无法选择该角色；离队前的历史章节不受影响。</div>
        <label>离队日期<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        {conflicts.length > 0 && <ConflictList conflicts={conflicts} />}
        <button className="primary full" onClick={confirm}>确认离队</button>
      </div>
    </div>
  );
}

/* ---------- 主应用 ---------- */
function App() {
  const [data, setData] = useState(read);
  const [tab, setTab] = useState('timeline');
  const [activeId, setActiveId] = useState(() => bySeq(read().chapters)[0]?.id);
  const [modal, setModal] = useState(null); // {type:'new'} | {type:'edit',id} | {type:'depart',name}
  const [viewV, setViewV] = useState(null); // null = 当前版本
  const [notice, setNotice] = useState('');
  const [auditConflicts] = useState(() => audit(read()));

  useEffect(() => localStorage.setItem(STORE_KEY, JSON.stringify(data)), [data]);
  useEffect(() => { setViewV(null); }, [activeId]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const chapters = bySeq(data.chapters);
  const active = chapters.find(c => c.id === activeId) || chapters[0];
  const shown = active ? (viewV == null ? cur(active) : active.versions.find(x => x.v === viewV) || cur(active)) : null;
  const isHistory = viewV != null && shown !== cur(active);

  const saveChapter = draft => {
    if (modal.type === 'new') {
      const seq = Math.max(0, ...data.chapters.map(c => c.seq)) + 1;
      const ch = {id: Date.now(), seq, title: draft.title, tag: draft.tag, color: '#d8a153',
        versions: [{v: 1, date: draft.date, summary: draft.summary, participants: draft.participants, reason: '初始记录', at: new Date().toISOString()}]};
      setData({...data, chapters: [...data.chapters, ch]});
      setActiveId(ch.id);
      setNotice('新章节已加入时间线，内容已冻结');
    } else {
      const ch = data.chapters.find(c => c.id === modal.id);
      const v = cur(ch);
      const changed = draft.date !== v.date || draft.summary !== v.summary || !sameList(draft.participants, v.participants);
      setData({
        ...data,
        chapters: data.chapters.map(c => {
          if (c.id !== ch.id) return c;
          const nextCh = {...c, title: draft.title, tag: draft.tag};
          if (changed) nextCh.versions = [...c.versions, {v: v.v + 1, date: draft.date, summary: draft.summary, participants: draft.participants, reason: draft.reason, at: new Date().toISOString()}];
          return nextCh;
        }),
      });
      setNotice(changed ? `已生成新版本 v${v.v + 1}，旧版本仍可查看` : '章节信息已更新');
    }
    setModal(null);
  };

  const depart = date => {
    setData({...data, characters: data.characters.map(c => c.name === modal.name ? {...c, status: 'departed', departedOn: date} : c)});
    setNotice(`${modal.name} 已于 ${date} 离队，后续章节将无法选择`);
    setModal(null);
  };

  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    a.download = 'campaign.json';
    a.click();
    setNotice('战役记录已导出');
  };

  const participated = name => chapters.filter(ch => cur(ch).participants.includes(name)).length;

  return (
    <div className="shell">
      <aside>
        <div className="logo"><span>✦</span> CAMPAIGNER</div>
        <div className="campaign"><small>当前战役</small><strong>{data.name}</strong><span>{data.system} · 2024</span></div>
        <nav>{[['timeline', '◌', '时间线'], ['characters', '♙', '角色与阵营'], ['places', '⌖', '地点图鉴'], ['loot', '◇', '战利品']].map(([id, i, t]) =>
          <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><i>{i}</i>{t}</button>)}
        </nav>
        <div className="side-bottom"><button>⚙ 偏好设置</button><small>本地存储已开启 · 刷新后状态一致</small></div>
      </aside>

      <main>
        <header>
          <div>
            <span className="crumb">MY CAMPAIGN / {data.system}</span>
            <h1>{tab === 'timeline' ? '战役时间线' : tab === 'characters' ? '角色与阵营' : tab === 'places' ? '地点图鉴' : '战利品'}</h1>
          </div>
          <div className="actions">
            <button onClick={exportData} className="outline">↓ 导出</button>
            <button onClick={() => setModal({type: 'new'})} className="primary">＋ 新建章节</button>
          </div>
        </header>

        {auditConflicts.length > 0 && (
          <div className="audit"><ConflictList conflicts={auditConflicts} /></div>
        )}

        {tab === 'timeline' && (
          <div className="timeline-layout">
            <section className="timeline">
              <div className="timeline-intro">
                <div><span>THE CHRONICLE</span><h2>记录每一次冒险</h2></div>
                <span className="count">{chapters.length} CHAPTERS</span>
              </div>
              {chapters.map((s, i) => {
                const v = cur(s);
                return (
                  <button className={'chapter ' + (activeId === s.id ? 'selected' : '')} onClick={() => setActiveId(s.id)} key={s.id}>
                    <div className="date"><b>{new Date(v.date).toLocaleDateString('zh-CN', {month: '2-digit', day: '2-digit'})}</b><small>{new Date(v.date).getFullYear()}</small></div>
                    <div className="line"><span style={{background: s.color}}></span>{i < chapters.length - 1 && <i />}</div>
                    <div className="chapter-copy">
                      <div className="tag">{s.tag}</div>
                      <h3>{s.title}{s.versions.length > 1 && <em className="vbadge">v{s.versions.length}</em>}</h3>
                      <p>{v.summary}</p>
                      <div className="chapter-meta">👥 {v.participants.join('、')}</div>
                    </div>
                    <span className="arrow">↗</span>
                  </button>
                );
              })}
            </section>

            {active && shown && (
              <section className="detail-panel">
                <div className="detail-cover" style={{background: active.color}}>
                  <span>CHAPTER {String(chapters.findIndex(x => x.id === active.id) + 1).padStart(2, '0')}</span><i>✦</i>
                </div>
                <div className="detail-body">
                  {isHistory && (
                    <div className="rev-banner">
                      <span>正在查看历史版本 v{shown.v}（当前为 v{cur(active).v}），内容只读</span>
                      <button onClick={() => setViewV(null)}>回到当前版本</button>
                    </div>
                  )}
                  <span className="tag">{active.tag}</span>
                  <h2>{active.title}</h2>
                  <p>{shown.summary}</p>
                  <div className="meta-grid">
                    <div><small>游戏日期</small><strong>{shown.date}</strong></div>
                    <div><small>版本</small><strong>v{shown.v} / 共 {active.versions.length} 版</strong></div>
                  </div>
                  <div className="meta-block">
                    <small>参与者（{shown.participants.length}）</small>
                    <div className="participants">{shown.participants.map(n => <Avatar key={n} data={data} name={n} />)}</div>
                  </div>
                  <div className="frozen">🔒 日期、摘要与参与者已冻结{isHistory ? ' · 历史版本不可修改' : ' · 修改将生成带原因的新版本'}</div>
                  <div className="note">
                    <span>✎</span>
                    <div><strong>版本链</strong><p>每次修订生成新版本，旧版本保留可查。</p></div>
                    {!isHistory && <button onClick={() => setModal({type: 'edit', id: active.id})}>修订</button>}
                  </div>
                  <div className="version-list">
                    {active.versions.map(ver => (
                      <button key={ver.v} className={(ver.v === cur(active).v ? 'cur ' : '') + (shown.v === ver.v ? 'viewing' : '')}
                        title={`${ver.reason} · ${new Date(ver.at).toLocaleString('zh-CN')}`}
                        onClick={() => setViewV(ver.v === cur(active).v ? null : ver.v)}>
                        v{ver.v}{ver.v === cur(active).v ? ' · 当前' : ''}
                      </button>
                    ))}
                  </div>
                  <div className="rev-log">
                    {active.versions.map(ver => (
                      <div key={ver.v}><b>v{ver.v}</b><span>{ver.reason}</span><small>{new Date(ver.at).toLocaleString('zh-CN')}</small></div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'characters' && (
          <section className="cards">
            <div className="section-note">队伍中有 {data.characters.filter(c => c.status === 'active').length} 位在队冒险者。角色离队后，日期不早于离队日期的章节将无法选择该角色；离队前的历史章节不受影响。</div>
            {data.characters.map(c => (
              <article className="char-card" key={c.name}>
                <div className="avatar" style={{background: c.color}}>{c.name[0]}</div>
                <div>
                  <small>{c.role}</small>
                  <h3>{c.name}</h3>
                  <p>玩家 · {c.player} · 参与 {participated(c.name)} 章</p>
                  <span className={'badge ' + c.status}>{c.status === 'active' ? '在队' : `离队于 ${c.departedOn}`}</span>
                </div>
                {c.status === 'active'
                  ? <button className="depart-btn" onClick={() => setModal({type: 'depart', name: c.name})}>标记离队</button>
                  : <button onClick={() => setNotice(`${c.name} 已离队，历史章节中的记录保持不变`)}>↗</button>}
              </article>
            ))}
          </section>
        )}

        {tab === 'places' && (
          <section className="empty">
            <div>⌖</div><h2>地点图鉴</h2>
            <p>从章节笔记中收集地点。当前已记录灰港、雾林和失落钟楼。</p>
            <div className="place-list"><span>01　灰港 <b>已探索</b></span><span>02　失落钟楼 <b>已探索</b></span><span>03　雾林 <b>待探索</b></span></div>
          </section>
        )}

        {tab === 'loot' && (
          <section className="empty">
            <div>◇</div><h2>战利品清单</h2>
            <p>追踪旅途中获得的装备、遗物和金币。</p>
            <div className="place-list"><span>月光草 × 3 <b>消耗品</b></span><span>古老铜币 × 1 <b>遗物</b></span><span>灰港守卫徽章 × 2 <b>任务物品</b></span></div>
          </section>
        )}
      </main>

      {modal?.type === 'new' && <ChapterModal data={data} mode="new" onClose={() => setModal(null)} onSave={saveChapter} />}
      {modal?.type === 'edit' && <ChapterModal data={data} mode="edit" chapter={data.chapters.find(c => c.id === modal.id)} onClose={() => setModal(null)} onSave={saveChapter} />}
      {modal?.type === 'depart' && <DepartModal data={data} name={modal.name} onClose={() => setModal(null)} onConfirm={depart} />}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
