import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORE = 'campaign-log-v2';
const PALETTE = ['#d8a153', '#93b7a6', '#b9a6d1', '#7fa8c9', '#d18a8a', '#a8bd7e'];

const seed = {
  name: '暮光边境',
  system: 'D&D 5E',
  characters: [
    { id: 'c1', name: '艾德里安', role: '圣骑士', player: '林默', color: '#d8a153', joinedAt: '2024-06-01', departedAt: null },
    { id: 'c2', name: '瑟琳', role: '游侠', player: '安然', color: '#93b7a6', joinedAt: '2024-06-01', departedAt: null },
    { id: 'c3', name: '莫尔', role: '术士', player: '周岳', color: '#b9a6d1', joinedAt: '2024-06-01', departedAt: null },
  ],
  chapters: [
    { id: 's1', seq: 1, color: '#d8a153', versions: [{ v: 1, title: '第一章：灰港的钟声', date: '2024-06-08', summary: '队伍抵达灰港，在失落的钟楼发现了神秘符文。', tag: '主线', participants: ['c1', 'c2', 'c3'], reason: '初始记录', savedAt: '2024-06-08T20:00:00' }] },
    { id: 's2', seq: 2, color: '#93b7a6', versions: [{ v: 1, title: '第二章：雾中来客', date: '2024-06-15', summary: '与流浪法师伊琳结盟，追踪海雾中的脚印。', tag: '主线', participants: ['c1', 'c2'], reason: '初始记录', savedAt: '2024-06-15T20:00:00' }] },
    { id: 's3', seq: 3, color: '#b9a6d1', versions: [{ v: 1, title: '支线：深林采药', date: '2024-06-22', summary: '帮助村民寻找月光草，获得一枚古老铜币。', tag: '支线', participants: ['c2', 'c3'], reason: '初始记录', savedAt: '2024-06-22T20:00:00' }] },
  ],
};

// ---------- 领域工具 ----------
const cur = (ch) => ch.versions[ch.versions.length - 1];
const bySeq = (a, b) => a.seq - b.seq;
const findChar = (data, id) => data.characters.find((c) => c.id === id);
const charName = (data, id) => findChar(data, id)?.name || '未知角色';
// 角色在某日期是否可选：已入队且（未离队 或 章节日期早于离队日）
const availAt = (c, date) => (!c.joinedAt || date >= c.joinedAt) && (!c.departedAt || date < c.departedAt);
const ordered = (data) => [...data.chapters].sort(bySeq);
const lastDate = (data) => {
  const list = ordered(data);
  return list.length ? cur(list[list.length - 1]).date : new Date().toISOString().slice(0, 10);
};
const fmtTime = (t) => new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

// ---------- 规则校验（冲突对象统一携带：规则 / 章节 / 日期 / 角色） ----------
function validateChapter(data, draft, selfId) {
  const conflicts = [];
  const title = draft.title || '（未命名章节）';
  const others = ordered(data).filter((c) => c.id !== selfId);
  const selfSeq = selfId ? data.chapters.find((c) => c.id === selfId).seq : Infinity;
  const prev = others.filter((c) => c.seq < selfSeq).pop();
  const next = others.find((c) => c.seq > selfSeq);
  if (prev && draft.date < cur(prev).date)
    conflicts.push({ rule: 'R1 · 日期顺序', message: `章节日期不得早于上一章（${cur(prev).date}）`, chapter: cur(prev).title, date: cur(prev).date, chars: cur(prev).participants.map((id) => charName(data, id)).join('、') || '—' });
  if (next && draft.date > cur(next).date)
    conflicts.push({ rule: 'R1 · 日期顺序', message: `章节日期不得晚于下一章（${cur(next).date}）`, chapter: cur(next).title, date: cur(next).date, chars: cur(next).participants.map((id) => charName(data, id)).join('、') || '—' });
  if (!draft.participants.length)
    conflicts.push({ rule: 'R2 · 参与角色', message: '未选择参与角色，不能保存', chapter: title, date: draft.date, chars: '（未选择）' });
  draft.participants.forEach((id) => {
    const c = findChar(data, id);
    if (!c) return;
    if (c.departedAt && draft.date >= c.departedAt)
      conflicts.push({ rule: 'R3 · 角色离队', message: `${c.name} 已于 ${c.departedAt} 离队，不能参与该日及之后的章节`, chapter: title, date: draft.date, chars: c.name });
    if (c.joinedAt && draft.date < c.joinedAt)
      conflicts.push({ rule: 'R4 · 尚未入队', message: `${c.name} 于 ${c.joinedAt} 才入队，不能参与更早的章节`, chapter: title, date: draft.date, chars: c.name });
  });
  return conflicts;
}

function validateDeparture(data, charId, date) {
  const c = findChar(data, charId);
  return ordered(data)
    .filter((ch) => cur(ch).date >= date && cur(ch).participants.includes(charId))
    .map((ch) => ({ rule: 'R5 · 离队冲突', message: `${c.name} 仍参与该章节，离队日期必须晚于章节日期`, chapter: cur(ch).title, date: cur(ch).date, chars: c.name }));
}

// ---------- 通用组件 ----------
const read = () => {
  try {
    const d = JSON.parse(localStorage.getItem(STORE));
    if (d && Array.isArray(d.chapters) && Array.isArray(d.characters)) return d;
  } catch {}
  return seed;
};

function Modal({ children, onClose, wide }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={'modal' + (wide ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>×</button>
        {children}
      </div>
    </div>
  );
}

function Conflicts({ list }) {
  if (!list.length) return null;
  return (
    <div className="conflicts">
      <strong>⚠ 保存被阻止 · 触发 {list.length} 条规则</strong>
      <ul>
        {list.map((c, i) => (
          <li key={i}>
            <div><span className="rule-tag">{c.rule}</span>{c.message}</div>
            <small>章节《{c.chapter}》 · 日期 {c.date} · 角色 {c.chars}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- 章节新建 / 修改（修改 = 生成带原因的新版本） ----------
function ChapterModal({ data, chapter, onClose, onCommit }) {
  const isEdit = !!chapter;
  const v = isEdit ? cur(chapter) : null;
  const [form, setForm] = useState(
    isEdit
      ? { title: v.title, date: v.date, summary: v.summary, tag: v.tag, participants: [...v.participants], reason: '' }
      : { title: '', date: lastDate(data), summary: '', tag: '主线', participants: [], reason: '' }
  );
  const [conflicts, setConflicts] = useState([]);
  const [err, setErr] = useState('');
  const toggle = (id) =>
    setForm((f) => ({ ...f, participants: f.participants.includes(id) ? f.participants.filter((x) => x !== id) : [...f.participants, id] }));
  const save = () => {
    if (!form.title.trim()) return setErr('请填写章节标题');
    if (isEdit && !form.reason.trim()) return setErr('章节已冻结，修改必须填写修改原因以生成新版本');
    setErr('');
    const list = validateChapter(data, { ...form, title: form.title.trim() }, chapter?.id);
    if (list.length) return setConflicts(list);
    onCommit({ ...form, title: form.title.trim(), reason: form.reason.trim() });
  };
  return (
    <Modal onClose={onClose} wide>
      <span className="crumb">{isEdit ? `REVISE · v${v.v} → v${v.v + 1}` : 'NEW CHAPTER'}</span>
      <h2>{isEdit ? `修改《${v.title}》` : '记录新的章节'}</h2>
      {isEdit && <p className="modal-note">当前版本的日期、摘要与参与者已冻结。保存将生成新版本 v{v.v + 1}，旧版本保留在版本链中可随时查阅。</p>}
      <label>章节标题<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例：第三章：月下集市" /></label>
      <label>游戏日期<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
      <label>章节摘要<textarea rows="3" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="发生了什么？" /></label>
      <label>章节类型
        <select value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}>
          <option>主线</option><option>支线</option><option>番外</option>
        </select>
      </label>
      <label>参与角色（至少选择一位，未选择不能保存）</label>
      <div className="plist">
        {data.characters.map((c) => {
          const ok = availAt(c, form.date);
          const checked = form.participants.includes(c.id);
          return (
            <label key={c.id} className={'pitem' + (ok ? '' : ' disabled') + (checked ? ' checked' : '')}>
              <input type="checkbox" checked={checked} disabled={!ok && !checked} onChange={() => toggle(c.id)} />
              <span className="dot" style={{ background: c.color }} />
              <b>{c.name}</b><small>{c.role}</small>
              {!ok && <em>{c.departedAt && form.date >= c.departedAt ? `已于 ${c.departedAt} 离队` : `${c.joinedAt} 才入队`}</em>}
              {!ok && checked && <em className="warn">与当前日期冲突</em>}
            </label>
          );
        })}
      </div>
      {isEdit && <label>修改原因（必填，将记录进版本链）<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="例：修正日期笔误 / 补充遗漏的参与者" /></label>}
      {err && <div className="form-err">{err}</div>}
      <Conflicts list={conflicts} />
      <button className="primary full" onClick={save}>{isEdit ? `保存为 v${v.v + 1}` : '保存章节'}</button>
    </Modal>
  );
}

// ---------- 离队 ----------
function DepartModal({ data, char, onClose, onCommit }) {
  const [date, setDate] = useState(lastDate(data));
  const [conflicts, setConflicts] = useState([]);
  const save = () => {
    const list = validateDeparture(data, char.id, date);
    if (list.length) return setConflicts(list);
    onCommit(date);
  };
  return (
    <Modal onClose={onClose}>
      <span className="crumb">DEPARTURE</span>
      <h2>{char.name} 离队</h2>
      <p className="modal-note">离队后，日期不早于离队日的章节将无法再选择该角色；离队日之前的历史章节不受影响。若角色仍参与该日及之后的章节，需先修正这些章节。</p>
      <label>离队日期<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <Conflicts list={conflicts} />
      <button className="primary full" onClick={save}>确认离队</button>
    </Modal>
  );
}

// ---------- 添加角色 ----------
function CharModal({ data, onClose, onCommit }) {
  const [form, setForm] = useState({ name: '', role: '', player: '', joinedAt: lastDate(data) });
  const [err, setErr] = useState('');
  const save = () => {
    if (!form.name.trim()) return setErr('请填写角色名称');
    onCommit({ ...form, name: form.name.trim(), role: form.role.trim() || '冒险者', player: form.player.trim() || '—' });
  };
  return (
    <Modal onClose={onClose}>
      <span className="crumb">NEW CHARACTER</span>
      <h2>添加角色</h2>
      <label>角色名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：伊琳" /></label>
      <label>职业<input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="例：法师" /></label>
      <label>玩家<input value={form.player} onChange={(e) => setForm({ ...form, player: e.target.value })} placeholder="玩家姓名" /></label>
      <label>入队日期<input type="date" value={form.joinedAt} onChange={(e) => setForm({ ...form, joinedAt: e.target.value })} /></label>
      {err && <div className="form-err">{err}</div>}
      <button className="primary full" onClick={save}>加入队伍</button>
    </Modal>
  );
}

// ---------- 主应用 ----------
function App() {
  const [data, setData] = useState(read);
  const [tab, setTab] = useState('timeline');
  const [activeId, setActiveId] = useState(() => ordered(read())[0]?.id);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const [viewV, setViewV] = useState(null); // {id, idx} 正在查阅的历史版本

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(data)); }, [data]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 2600); return () => clearTimeout(t); }, [notice]);

  const chapters = ordered(data);
  const active = chapters.find((c) => c.id === activeId) || chapters[0];
  const viewIdx = viewV?.id === active?.id ? Math.min(viewV.idx, active.versions.length - 1) : (active ? active.versions.length - 1 : 0);
  const v = active?.versions[viewIdx];
  const isCur = active ? viewIdx === active.versions.length - 1 : false;

  const notify = (msg) => setNotice(msg);
  const selectChapter = (id) => { setActiveId(id); setViewV(null); };

  const commitNew = (form) => {
    const seq = chapters.length ? Math.max(...chapters.map((c) => c.seq)) + 1 : 1;
    const ch = { id: 's' + Date.now(), seq, color: PALETTE[(seq - 1) % PALETTE.length], versions: [{ v: 1, title: form.title, date: form.date, summary: form.summary, tag: form.tag, participants: form.participants, reason: '初始记录', savedAt: new Date().toISOString() }] };
    setData({ ...data, chapters: [...data.chapters, ch] });
    setActiveId(ch.id); setViewV(null); setModal(null);
    notify(`《${form.title}》已加入编年史`);
  };

  const commitEdit = (id, form) => {
    setData({
      ...data,
      chapters: data.chapters.map((ch) => ch.id !== id ? ch : {
        ...ch,
        versions: [...ch.versions, { v: ch.versions.length + 1, title: form.title, date: form.date, summary: form.summary, tag: form.tag, participants: form.participants, reason: form.reason, savedAt: new Date().toISOString() }],
      }),
    });
    setViewV(null); setModal(null);
    notify('已生成新版本，旧版本仍可查阅');
  };

  const commitDepart = (id, date) => {
    setData({ ...data, characters: data.characters.map((c) => c.id === id ? { ...c, departedAt: date } : c) });
    setModal(null);
    notify(`${charName(data, id)} 已于 ${date} 离队，后续章节将无法选择`);
  };

  const rejoin = (c) => {
    setData({ ...data, characters: data.characters.map((x) => x.id === c.id ? { ...x, departedAt: null } : x) });
    notify(`${c.name} 已归队`);
  };

  const commitChar = (form) => {
    const c = { id: 'c' + Date.now(), ...form, color: PALETTE[data.characters.length % PALETTE.length], departedAt: null };
    setData({ ...data, characters: [...data.characters, c] });
    setModal(null);
    notify(`${c.name} 已加入队伍`);
  };

  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'campaign.json';
    a.click();
    notify('战役记录已导出');
  };

  const inParty = data.characters.filter((c) => !c.departedAt).length;

  return (
    <div className="shell">
      <aside>
        <div className="logo"><span>✦</span> CAMPAIGNER</div>
        <div className="campaign"><small>当前战役</small><strong>{data.name}</strong><span>{data.system} · 2024</span></div>
        <nav>
          {[['timeline', '◌', '时间线'], ['characters', '♙', '角色与阵营'], ['places', '⌖', '地点图鉴'], ['loot', '◇', '战利品']].map(([id, i, t]) => (
            <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><i>{i}</i>{t}</button>
          ))}
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
            <button onClick={() => setModal({ type: 'new' })} className="primary">＋ 新建章节</button>
          </div>
        </header>

        {tab === 'timeline' && (
          <div className="timeline-layout">
            <section className="timeline">
              <div className="timeline-intro">
                <div><span>THE CHRONICLE</span><h2>记录每一次冒险</h2></div>
                <span className="count">{chapters.length} CHAPTERS</span>
              </div>
              {chapters.map((s, i) => {
                const sv = cur(s);
                return (
                  <button className={'chapter ' + (activeId === s.id ? 'selected' : '')} onClick={() => selectChapter(s.id)} key={s.id}>
                    <div className="date"><b>{new Date(sv.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</b><small>{new Date(sv.date).getFullYear()}</small></div>
                    <div className="line"><span style={{ background: s.color }}></span>{i < chapters.length - 1 && <i />}</div>
                    <div className="chapter-copy">
                      <div className="tag">{sv.tag}{s.versions.length > 1 && <span className="vbadge">v{sv.v}</span>}</div>
                      <h3>{sv.title}</h3>
                      <p>{sv.summary}</p>
                      <div className="minis">
                        {sv.participants.map((id) => {
                          const c = findChar(data, id);
                          return <span key={id} className={c?.departedAt ? 'gone' : ''} style={{ background: c?.color || '#ccc' }} title={charName(data, id)}>{c?.name[0] || '?'}</span>;
                        })}
                      </div>
                    </div>
                    <span className="arrow">↗</span>
                  </button>
                );
              })}
            </section>

            {active && (
              <section className="detail-panel">
                <div className="detail-cover" style={{ background: active.color }}>
                  <span>CHAPTER {String(chapters.findIndex((x) => x.id === active.id) + 1).padStart(2, '0')}</span><i>✦</i>
                </div>
                <div className="detail-body">
                  <span className="tag">{v.tag}</span>
                  <h2>{v.title}</h2>
                  <p>{v.summary || '（无摘要）'}</p>
                  <div className="meta-grid">
                    <div><small>游戏日期</small><strong>{v.date}</strong></div>
                    <div><small>参与角色</small><strong>{v.participants.length} 位</strong></div>
                  </div>
                  <div className="chips">
                    {v.participants.map((id) => {
                      const c = findChar(data, id);
                      return (
                        <span key={id} className={'chip' + (c?.departedAt ? ' gone' : '')}>
                          <i style={{ background: c?.color || '#ccc' }}>{c?.name[0] || '?'}</i>
                          {charName(data, id)}{c?.departedAt && <em>已离队</em>}
                        </span>
                      );
                    })}
                  </div>
                  <div className="vchain">
                    <span>版本链</span>
                    {active.versions.map((ver, i) => (
                      <button key={ver.v} className={i === viewIdx ? 'on' : ''} onClick={() => setViewV({ id: active.id, idx: i })}>
                        v{ver.v}{i === active.versions.length - 1 ? ' · 当前' : ''}
                      </button>
                    ))}
                  </div>
                  {isCur ? (
                    <div className="vnote">当前版本 v{v.v} · {v.reason} · 保存于 {fmtTime(v.savedAt)} · 日期、摘要与参与者已冻结</div>
                  ) : (
                    <div className="vbanner">
                      <b>历史版本 v{v.v} · 已冻结</b>
                      保存于 {fmtTime(v.savedAt)} · 修改原因：{v.reason}<br />
                      内容只读；如需修改，请基于当前版本生成新版本。
                    </div>
                  )}
                  <button className="primary" style={{ marginTop: 18 }} onClick={() => setModal({ type: 'edit', id: active.id })}>✎ 修改（生成新版本）</button>
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'characters' && (
          <section className="cards">
            <div className="section-note">在队 {inParty} 位 · 离队 {data.characters.length - inParty} 位。角色离队后，日期不早于离队日的章节无法再选择该角色；离队前的历史章节不受影响。</div>
            {data.characters.map((c) => {
              const n = data.chapters.filter((ch) => cur(ch).participants.includes(c.id)).length;
              return (
                <article className={'char-card' + (c.departedAt ? ' departed' : '')} key={c.id}>
                  <div className="avatar" style={{ background: c.color }}>{c.name[0]}</div>
                  <div>
                    <small>{c.role} · 玩家 {c.player}</small>
                    <h3>{c.name}<span className={'badge ' + (c.departedAt ? 'off' : 'on')}>{c.departedAt ? '离队' : '在队'}</span></h3>
                    <p>{c.departedAt ? `已于 ${c.departedAt} 离队` : `${c.joinedAt} 入队`} · 参与 {n} 章</p>
                  </div>
                  <div className="card-actions">
                    {c.departedAt
                      ? <button onClick={() => rejoin(c)}>归队</button>
                      : <button onClick={() => setModal({ type: 'depart', id: c.id })}>离队</button>}
                  </div>
                </article>
              );
            })}
            <button className="add-char" onClick={() => setModal({ type: 'addChar' })}>＋ 添加角色</button>
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

      {modal?.type === 'new' && <ChapterModal data={data} onClose={() => setModal(null)} onCommit={commitNew} />}
      {modal?.type === 'edit' && <ChapterModal data={data} chapter={data.chapters.find((c) => c.id === modal.id)} onClose={() => setModal(null)} onCommit={(form) => commitEdit(modal.id, form)} />}
      {modal?.type === 'depart' && <DepartModal data={data} char={findChar(data, modal.id)} onClose={() => setModal(null)} onCommit={(date) => commitDepart(modal.id, date)} />}
      {modal?.type === 'addChar' && <CharModal data={data} onClose={() => setModal(null)} onCommit={commitChar} />}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
