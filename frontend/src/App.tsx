import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Category, type ExpenseRecord, type RecordInput, type SpendlogData, type User } from './api';

const icons = ['ti-device-gamepad-2', 'ti-palette', 'ti-plane', 'ti-music', 'ti-book', 'ti-camera',
  'ti-run', 'ti-trophy', 'ti-pizza', 'ti-shirt', 'ti-ball-football', 'ti-headphones'];
const colors = {
  light: ['#1D9E75', '#7F77DD', '#DD7F5A', '#5A9DDD', '#DD5A9D', '#DDAA5A'],
  dark: ['#5DCAA5', '#AFA9EC', '#ECAFA9', '#A9D0EC', '#ECA9D0', '#ECD4A9'],
};
const emptyData: SpendlogData = { categories: [], records: [] };
const money = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const seoulToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const monthKey = (date: string) => date.slice(0, 7);

function Icon({ name }: { name: string }) { return <i className={`ti ${name}`} aria-hidden="true" />; }

function TrendChart({ records, color }: { records: ExpenseRecord[]; color: string }) {
  const today = seoulToday();
  const year = Number(today.slice(0, 4));
  const count = Number(today.slice(5, 7));
  const values = Array.from({ length: count }, (_, index) => records
    .filter(record => Number(record.date.slice(0, 4)) === year && Number(record.date.slice(5, 7)) === index + 1)
    .reduce((sum, record) => sum + record.amount, 0));
  const max = Math.max(...values, 1);
  const left = 42, right = 760, top = 14, bottom = 182;
  const x = (index: number) => left + (right - left) * (count === 1 ? 0.5 : index / (count - 1));
  const y = (value: number) => bottom - (value / max) * (bottom - top);
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const area = `${left},${bottom} ${points} ${right},${bottom}`;
  return <div className="chart-wrap">
    <svg viewBox="0 0 800 220" role="img" aria-label={`${year}년 월별 지출 추이`} preserveAspectRatio="none">
      {[0, 0.5, 1].map(level => <g key={level}>
        <line x1={left} x2={right} y1={y(max * level)} y2={y(max * level)} className="chart-grid" />
        <text x="36" y={y(max * level) + 4} textAnchor="end" className="chart-label">{Math.round(max * level / 10000)}만</text>
      </g>)}
      <polygon points={area} fill={color} opacity="0.12" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {values.map((value, index) => <g key={index}>
        <circle cx={x(index)} cy={y(value)} r="3.5" fill={color}><title>{index + 1}월 {money(value)}</title></circle>
        <text x={x(index)} y="210" textAnchor="middle" className="chart-label">{index + 1}월</text>
      </g>)}
    </svg>
  </div>;
}

export default function App({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [data, setData] = useState<SpendlogData>(emptyData);
  const [selected, setSelected] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('spendlog_theme') === 'dark' ? 'dark' : 'light');
  const [modal, setModal] = useState<'record' | 'categories' | null>(null);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [form, setForm] = useState<RecordInput>({ category: '', name: '', amount: 0, date: seoulToday() });
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState(icons[0]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const next = await api.data();
    setData(next);
    setSelected(current => next.categories.some(c => c.id === current) ? current : next.categories[0]?.id ?? '');
  };

  useEffect(() => { load().catch(e => setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다')); }, []);
  useEffect(() => { document.body.dataset.theme = theme; localStorage.setItem('spendlog_theme', theme); }, [theme]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await load(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : '요청에 실패했습니다'); return false; }
    finally { setBusy(false); }
  };

  const category = data.categories.find(c => c.id === selected);
  const categoryIndex = Math.max(0, data.categories.findIndex(c => c.id === selected));
  const records = data.records.filter(r => r.category === selected).sort((a, b) => b.date.localeCompare(a.date));
  const total = records.reduce((sum, r) => sum + r.amount, 0);
  const thisMonth = monthKey(seoulToday());
  const currentRecords = records.filter(r => monthKey(r.date) === thisMonth);
  const currentTotal = currentRecords.reduce((sum, r) => sum + r.amount, 0);
  const now = seoulToday();
  const recentMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
  const average = Math.round(records.filter(r => recentMonths.includes(monthKey(r.date)))
    .reduce((sum, r) => sum + r.amount, 0) / 6);
  const groups = records.reduce<Record<string, ExpenseRecord[]>>((acc, record) => {
    (acc[monthKey(record.date)] ??= []).push(record);
    return acc;
  }, {});
  const monthKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  function openRecord(record: ExpenseRecord | null = null) {
    setEditing(record);
    setForm(record ? { category: record.category, name: record.name, amount: record.amount, date: record.date }
      : { category: selected, name: '', amount: 0, date: seoulToday() });
    setModal('record');
  }

  async function saveRecord(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !Number.isSafeInteger(form.amount) || form.amount <= 0 || !form.date) {
      setError('항목명, 0원보다 큰 정수 금액, 날짜를 입력해 주세요'); return;
    }
    if (await run(() => editing ? api.updateRecord(editing.id, { ...form, name: form.name.trim() })
      : api.addRecord({ ...form, name: form.name.trim() }))) setModal(null);
  }

  async function deleteRecord(record: ExpenseRecord) {
    if (!window.confirm('이 기록을 삭제하시겠습니까?')) return;
    if (await run(() => api.deleteRecord(record.id))) setModal(null);
  }

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    if (!catName.trim()) { setError('카테고리 이름을 입력해 주세요'); return; }
    let created: Category | undefined;
    if (await run(async () => { created = await api.addCategory(catName.trim(), catIcon); })) {
      setCatName(''); setCatIcon(icons[0]);
      if (created) setSelected(created.id);
      setModal(null);
    }
  }

  async function deleteCategory(item: Category) {
    const count = data.records.filter(r => r.category === item.id).length;
    if (!window.confirm(count ? `이 카테고리의 기록 ${count}건도 함께 삭제됩니다. 계속하시겠습니까?`
      : '이 카테고리를 삭제하시겠습니까?')) return;
    await run(() => api.deleteCategory(item.id));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `spendlog_backup_${seoulToday().replaceAll('-', '')}.json`;
    link.click(); URL.revokeObjectURL(url);
  }

  async function importData(file?: File) {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !('categories' in parsed) || !('records' in parsed)
        || !Array.isArray(parsed.categories) || !Array.isArray(parsed.records)) throw new Error('올바른 백업 파일이 아닙니다');
      if (!window.confirm('현재 데이터가 백업 파일의 데이터로 교체됩니다. 계속하시겠습니까?')) return;
      if (await run(() => api.restore(parsed as SpendlogData))) setModal(null);
    } catch (e) { setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  }

  return <div id="app">
    <aside id="sidebar">
      <div className="logo-area"><div className="logo-mark">S</div><div className="logo-text">SpendLog</div></div>
      <div className="nav-label">카테고리</div>
      {data.categories.map(c => <button key={c.id} className={`nav-item ${selected === c.id ? 'active' : ''}`}
        onClick={() => setSelected(c.id)}><Icon name={c.icon} /><span>{c.name}</span></button>)}
      <div className="nav-label settings-label">설정</div>
      <button className="nav-item" onClick={() => setModal('categories')}><Icon name="ti-settings" /><span>카테고리 관리</span></button>
      <button className="nav-item" onClick={exportData}><Icon name="ti-download" /><span>데이터 백업</span></button>
      <button className="nav-item" onClick={() => fileRef.current?.click()}><Icon name="ti-upload" /><span>데이터 복원</span></button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => void importData(e.target.files?.[0])} />
      <div className="sidebar-bottom"><button className="theme-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        <Icon name={theme === 'light' ? 'ti-sun' : 'ti-moon'} /><span>{theme === 'light' ? '다크 모드' : '라이트 모드'}</span>
      </button>
        <div className="user-info" title={user.email}>{user.name || user.email}</div>
        <button className="theme-btn" onClick={onLogout}><Icon name="ti-logout" /><span>로그아웃</span></button></div>
    </aside>
    <main id="main">
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="닫기">×</button></div>}
      {category ? <>
        <div className="page-header"><h1 className="page-title">{category.name} 지출</h1>
          <button className="btn btn-primary" onClick={() => openRecord()} disabled={busy}><Icon name="ti-plus" />기록 추가</button></div>
        <div className="metrics">
          <div className="metric-card"><div className="metric-label">총 지출</div><div className="metric-value">{money(total)}</div><div className="metric-sub">전체 {records.length}건</div></div>
          <div className="metric-card"><div className="metric-label">이번 달</div><div className="metric-value">{money(currentTotal)}</div><div className="metric-sub">{currentRecords.length}건의 구매</div></div>
          <div className="metric-card"><div className="metric-label">월 평균</div><div className="metric-value">{money(average)}</div><div className="metric-sub">최근 6개월 기준</div></div>
        </div>
        <div className="card"><div className="card-title chart-title">월별 지출 추이</div>
          <TrendChart records={records} color={colors[theme][categoryIndex % 6]} /></div>
        <div className="card"><div className="card-title">{records.length ? '기록 내역' : '최근 기록'}</div>
          {!records.length ? <div className="empty-state"><Icon name="ti-receipt-off" /><p>아직 기록이 없습니다</p>
            <button className="btn btn-primary btn-sm" onClick={() => openRecord()}><Icon name="ti-plus" />첫 기록 추가</button></div>
            : monthKeys.map(key => {
              const items = groups[key] ?? [];
              const isCollapsed = collapsed[`${selected}_${key}`] ?? key !== thisMonth;
              return <div className="month-group" key={key}>
                <button className="month-header" onClick={() => setCollapsed(v => ({ ...v, [`${selected}_${key}`]: !isCollapsed }))}
                  aria-expanded={!isCollapsed}>
                  <Icon name={`ti-chevron-down month-chevron ${isCollapsed ? 'collapsed' : ''}`} />
                  <span className="month-label">{Number(key.slice(0, 4))}년 {Number(key.slice(5, 7))}월</span>
                  <span className="month-count">{items.length}건</span>
                  <span className="month-total">{money(items.reduce((sum, r) => sum + r.amount, 0))}</span>
                </button>
                {!isCollapsed && <div className="month-items">{items.map(record => <div className="tx-item" key={record.id}>
                  <div className="tx-icon" style={{ background: `var(--c${categoryIndex % 6}-bg)`, color: `var(--c${categoryIndex % 6}-t)` }}><Icon name={category.icon} /></div>
                  <div className="tx-info"><div className="tx-name">{record.name}</div><div className="tx-date">{record.date.replaceAll('-', '. ')}</div></div>
                  <div className="tx-amount">{money(record.amount)}</div>
                  <div className="tx-actions"><button className="tx-act-btn" aria-label={`${record.name} 수정`} onClick={() => openRecord(record)}><Icon name="ti-pencil" /></button>
                    <button className="tx-act-btn del" aria-label={`${record.name} 삭제`} onClick={() => void deleteRecord(record)}><Icon name="ti-trash" /></button></div>
                </div>)}</div>}
              </div>;
            })}</div>
      </> : <div className="empty-state first-use"><Icon name="ti-folder-plus" /><p>카테고리를 추가해 가계부를 시작해 주세요</p>
        <button className="btn btn-primary" onClick={() => setModal('categories')}><Icon name="ti-plus" />카테고리 추가</button></div>}
    </main>
    {modal && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={modal === 'record' ? '기록 편집' : '카테고리 관리'}>
        {modal === 'record' ? <form onSubmit={e => void saveRecord(e)}>
          <h2 className="modal-title">{editing ? '기록 수정' : '기록 추가'}</h2>
          <div className="form-group"><label className="form-label" htmlFor="record-category">카테고리</label>
            <select className="form-input" id="record-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="form-group"><label className="form-label" htmlFor="record-name">항목명</label>
            <input className="form-input" id="record-name" autoFocus maxLength={120} required placeholder="예: 스팀 게임 구매"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="form-group"><label className="form-label" htmlFor="record-amount">금액 (원)</label>
            <input className="form-input" id="record-amount" type="number" min="1" step="1" required
              value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label" htmlFor="record-date">날짜</label>
            <input className="form-input" id="record-date" type="date" required value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div className="modal-actions">{editing && <button className="btn btn-danger btn-sm modal-delete" type="button" onClick={() => void deleteRecord(editing)} disabled={busy}>삭제</button>}
            <button className="btn btn-outline" type="button" onClick={() => setModal(null)}>취소</button>
            <button className="btn btn-primary" type="submit" disabled={busy}>저장</button></div>
        </form> : <>
          <h2 className="modal-title">카테고리 관리</h2>
          {data.categories.map((c, index) => <div className="cat-item" key={c.id}>
            <div className="cat-item-icon" style={{ background: `var(--c${index % 6}-bg)`, color: `var(--c${index % 6}-t)` }}><Icon name={c.icon} /></div>
            <div className="cat-item-name">{c.name}</div><span className="cat-item-count">{data.records.filter(r => r.category === c.id).length}건</span>
            <button className="tx-act-btn del" aria-label={`${c.name} 삭제`} onClick={() => void deleteCategory(c)} disabled={busy}><Icon name="ti-trash" /></button>
          </div>)}
          <form className="category-form" onSubmit={e => void addCategory(e)}>
            <div className="card-title category-form-title">새 카테고리 추가</div>
            <div className="form-group"><label className="form-label" htmlFor="category-name">이름</label>
              <input className="form-input" id="category-name" maxLength={120} required placeholder="예: 여행, 음식"
                value={catName} onChange={e => setCatName(e.target.value)} /></div>
            <div className="form-group"><span className="form-label">아이콘</span><div className="icon-grid">
              {icons.map(icon => <button className={`icon-opt ${catIcon === icon ? 'selected' : ''}`} key={icon}
                type="button" aria-label={icon} aria-pressed={catIcon === icon} onClick={() => setCatIcon(icon)}><Icon name={icon} /></button>)}
            </div></div>
            <div className="modal-actions"><button className="btn btn-outline" type="button" onClick={() => setModal(null)}>닫기</button>
              <button className="btn btn-primary" type="submit" disabled={busy}>추가</button></div>
          </form>
        </>}
      </div>
    </div>}
  </div>;
}
