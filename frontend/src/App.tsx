import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Category, type ExpenseRecord, type RecordInput, type SpendlogData, type User } from './api';

const icons = ['ti-device-gamepad-2', 'ti-palette', 'ti-plane', 'ti-music', 'ti-book', 'ti-camera',
  'ti-run', 'ti-trophy', 'ti-pizza', 'ti-shirt', 'ti-ball-football', 'ti-headphones'];
const emptyData: SpendlogData = { categories: [], records: [] };
const won = (value: number) => value.toLocaleString('ko-KR');
const money = (value: number) => `${won(value)}원`;
const seoulToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const monthKey = (date: string) => date.slice(0, 7);

function Icon({ name }: { name: string }) { return <i className={`ti ${name}`} aria-hidden="true" />; }

// 금액을 막대 위에 짧게 적습니다. 예: 83,900 → 8.4만
const shortWon = (value: number) => value >= 10000
  ? `${(Math.round(value / 1000) / 10).toLocaleString('ko-KR')}만` : won(value);
const shiftMonth = (key: string, diff: number) => {
  const d = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + diff, 1));
  return d.toISOString().slice(0, 7);
};
const weekday = (date: string) => '일월화수목금토'[new Date(`${date}T00:00:00Z`).getUTCDay()];

// 최근 12개월 중 첫 기록이 있는 달부터 이번 달까지 보여 줍니다(최소 6개월).
// 달력에서 보고 있는 달을 진하게 칠하고, 막대를 누르면 달력이 그 달로 넘어갑니다.
function MonthBars({ records, active, onPick }: { records: ExpenseRecord[]; active: string; onPick: (month: string) => void }) {
  const current = monthKey(seoulToday());
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(current, i - 11));
  const values = months.map(key => records.filter(r => monthKey(r.date) === key).reduce((sum, r) => sum + r.amount, 0));
  const first = values.findIndex(value => value > 0);
  const start = Math.min(first < 0 ? 6 : first, 6);
  const shown = months.slice(start).map((key, i) => ({ key, value: values[start + i] ?? 0 }));
  const max = Math.max(...shown.map(m => m.value), 1);
  return <figure className="bars" aria-label="월별 지출">
    <figcaption className="bars-caption">월별 지출</figcaption>
    <div className="bars-plot">
      {shown.map(({ key, value }) => <button className={`bar ${key === active ? 'current' : ''}`} key={key}
        onClick={() => onPick(key)} aria-pressed={key === active}
        aria-label={`${Number(key.slice(0, 4))}년 ${Number(key.slice(5, 7))}월 ${money(value)}`}>
        {value > 0 && <span className="bar-value">{shortWon(value)}</span>}
        <span className="bar-fill" style={{ height: `${value ? Math.max(2, (value / max) * 82) : 0}%` }} />
        <span className="bar-label">{key.slice(5, 7) === '01' ? `${key.slice(2, 4)}년 ` : ''}{Number(key.slice(5, 7))}월</span>
      </button>)}
    </div>
  </figure>;
}

// 한 달을 달력으로 보여 줍니다. 그날 쓴 금액이 클수록 칸이 진해집니다.
function Calendar({ records, month, day, onMonth, onDay }: {
  records: ExpenseRecord[]; month: string; day: string | null;
  onMonth: (month: string) => void; onDay: (day: string | null) => void;
}) {
  const today = seoulToday();
  const year = Number(month.slice(0, 4)), mon = Number(month.slice(5, 7));
  const lead = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const totals: Record<string, number> = {};
  records.forEach(r => { if (monthKey(r.date) === month) totals[r.date] = (totals[r.date] ?? 0) + r.amount; });
  const max = Math.max(...Object.values(totals), 1);
  const level = (value: number) => value ? Math.min(4, Math.ceil((value / max) * 4)) : 0;
  return <section className="calendar" aria-label={`${year}년 ${mon}월 달력`}>
    <div className="cal-head">
      <button className="icon-btn" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="이전 달"><Icon name="ti-chevron-left" /></button>
      <span className="cal-title">{year !== Number(today.slice(0, 4)) && `${year}년 `}{mon}월</span>
      <button className="icon-btn" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="다음 달"
        disabled={month >= monthKey(today)}><Icon name="ti-chevron-right" /></button>
    </div>
    <div className="cal-grid">
      {[...'일월화수목금토'].map(w => <span className="cal-week" key={w}>{w}</span>)}
      {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
      {Array.from({ length: days }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`;
        const value = totals[date] ?? 0;
        return <button key={date} className={`cal-day lv${level(value)} ${date === day ? 'picked' : ''} ${date === today ? 'today' : ''}`}
          disabled={date > today} aria-pressed={date === day} onClick={() => onDay(date === day ? null : date)}
          aria-label={`${mon}월 ${i + 1}일${value ? ` ${money(value)}` : ''}`}>
          <span className="cal-num">{i + 1}</span>
          {value > 0 && <span className="cal-amt">{shortWon(value)}</span>}
        </button>;
      })}
    </div>
  </section>;
}

// 한 달 동안 카테고리마다 얼마를 썼는지 비중 막대로 보여 줍니다. 줄을 누르면 그 카테고리로 넘어갑니다.
function CategoryShare({ categories, records, month, selected, onPick }: {
  categories: Category[]; records: ExpenseRecord[]; month: string; selected: string; onPick: (id: string) => void;
}) {
  const rows = categories.map(c => ({
    c, value: records.filter(r => r.category === c.id && monthKey(r.date) === month).reduce((sum, r) => sum + r.amount, 0),
  })).sort((a, b) => b.value - a.value);
  const sum = rows.reduce((acc, row) => acc + row.value, 0);
  return <section className="share" aria-label="카테고리별 비중">
    <h2 className="bars-caption">{Number(month.slice(5, 7))}월 카테고리별 비중</h2>
    {sum === 0 ? <p className="share-empty">이 달엔 기록이 없어요.</p>
      : <ul>{rows.map(({ c, value }) => <li key={c.id}>
        <button className={`share-row ${c.id === selected ? 'active' : ''}`} onClick={() => onPick(c.id)}
          aria-label={`${c.name} ${money(value)}, ${Math.round((value / sum) * 100)}%`}>
          <span className="share-name"><Icon name={c.icon} />{c.name}</span>
          <span className="share-pct">{Math.round((value / sum) * 100)}%</span>
          <span className="share-amt">{money(value)}</span>
          <span className="share-track"><span className="share-fill" style={{ width: `${(value / sum) * 100}%` }} /></span>
        </button>
      </li>)}</ul>}
  </section>;
}

export default function App({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [data, setData] = useState<SpendlogData>(emptyData);
  const [selected, setSelected] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('spendlog_theme') === 'dark' ? 'dark' : 'light');
  const [modal, setModal] = useState<'record' | 'categories' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [form, setForm] = useState<RecordInput>({ category: '', name: '', amount: 0, date: seoulToday() });
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState(icons[0]);
  const [viewMonth, setViewMonth] = useState(() => monthKey(seoulToday()));
  const [day, setDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const next = await api.data();
    setData(next);
    setSelected(current => next.categories.some(c => c.id === current) ? current : next.categories[0]?.id ?? '');
  };

  useEffect(() => { load().catch(e => setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다')); }, []);
  useEffect(() => { document.body.dataset.theme = theme; localStorage.setItem('spendlog_theme', theme); }, [theme]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setModal(null); setMenuOpen(false); } };
    const onClick = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, []);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await load(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : '요청에 실패했습니다'); return false; }
    finally { setBusy(false); }
  };

  const category = data.categories.find(c => c.id === selected);
  const records = data.records.filter(r => r.category === selected).sort((a, b) => b.date.localeCompare(a.date));
  const total = records.reduce((sum, r) => sum + r.amount, 0);
  const categoryTotals = data.records.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + r.amount;
    return acc;
  }, {});
  const thisMonth = monthKey(seoulToday());
  const currentRecords = records.filter(r => monthKey(r.date) === thisMonth);
  const currentTotal = currentRecords.reduce((sum, r) => sum + r.amount, 0);
  const lastMonth = shiftMonth(thisMonth, -1);
  const lastTotal = records.filter(r => monthKey(r.date) === lastMonth).reduce((sum, r) => sum + r.amount, 0);
  const diff = currentTotal - lastTotal;
  const diffText = diff === 0 ? '지난달과 같아요' : `지난달보다 ${money(Math.abs(diff))} ${diff > 0 ? '더' : '덜'}`;
  const now = seoulToday();
  const recentMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
  const average = Math.round(records.filter(r => recentMonths.includes(monthKey(r.date)))
    .reduce((sum, r) => sum + r.amount, 0) / 6);
  const monthRecords = records.filter(r => monthKey(r.date) === viewMonth);
  const shownRecords = day ? monthRecords.filter(r => r.date === day) : monthRecords;
  const shownTotal = shownRecords.reduce((sum, r) => sum + r.amount, 0);
  const shownLabel = day ? `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 ${weekday(day)}요일`
    : `${Number(viewMonth.slice(5, 7))}월 전체`;

  const pickMonth = (month: string) => { setViewMonth(month); setDay(null); };
  const pickCategory = (id: string) => { setSelected(id); setDay(null); };

  function openRecord(record: ExpenseRecord | null = null) {
    setEditing(record);
    setForm(record ? { category: record.category, name: record.name, amount: record.amount, date: record.date }
      : { category: selected, name: '', amount: 0, date: day ?? seoulToday() });
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

  const menuAction = (action: () => void) => () => { setMenuOpen(false); action(); };

  return <div id="app">
    <header className="topbar">
      <div className="topbar-row">
        <div className="wordmark">SpendLog</div>
        <div className="topbar-tools">
          <button className="icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}>
            <Icon name={theme === 'light' ? 'ti-moon' : 'ti-sun'} /></button>
          <div className="menu" ref={menuRef}>
            <button className="icon-btn" onClick={() => setMenuOpen(v => !v)} aria-label="메뉴"
              aria-haspopup="menu" aria-expanded={menuOpen}><Icon name="ti-menu-2" /></button>
            {menuOpen && <div className="menu-panel" role="menu">
              <div className="menu-user" title={user.email}>{user.name || user.email}</div>
              <button role="menuitem" onClick={menuAction(() => setModal('categories'))}><Icon name="ti-category" />카테고리 관리</button>
              <button role="menuitem" onClick={menuAction(exportData)}><Icon name="ti-download" />데이터 백업</button>
              <button role="menuitem" onClick={menuAction(() => fileRef.current?.click())}><Icon name="ti-upload" />데이터 복원</button>
              <button role="menuitem" onClick={menuAction(onLogout)}><Icon name="ti-logout" />로그아웃</button>
            </div>}
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => void importData(e.target.files?.[0])} />
        </div>
      </div>
    </header>

    <main id="main">
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="닫기">×</button></div>}
      {data.categories.length > 0 && <nav className="chips" aria-label="카테고리">
        {data.categories.map(c => <button key={c.id} className={`chip ${selected === c.id ? 'active' : ''}`}
          aria-current={selected === c.id ? 'page' : undefined} onClick={() => pickCategory(c.id)}>
          <span className="chip-head"><Icon name={c.icon} /><span className="chip-name">{c.name}</span></span>
          <span className="chip-total">{money(categoryTotals[c.id] ?? 0)}</span></button>)}
        <button className="chip chip-add" onClick={() => setModal('categories')} aria-label="카테고리 추가"><Icon name="ti-plus" /></button>
      </nav>}
      {category ? <div className="layout"><div className="overview">
        <section className="hero">
          <div className="hero-head">
            <h1 className="hero-title">지금까지 {category.name}에 쓴 돈</h1>
            <button className="btn btn-primary add-btn" onClick={() => openRecord()} disabled={busy}><Icon name="ti-plus" />기록 추가</button>
          </div>
          <p className="hero-total"><span className="hero-num">{won(total)}</span><span className="hero-unit">원</span></p>
          <dl className="stats">
            <div><dt>이번 달</dt><dd>{money(currentTotal)}</dd><span className="stat-note">{diffText}</span></div>
            <div><dt>월 평균</dt><dd>{money(average)}</dd><span className="stat-note">최근 6개월</span></div>
            <div><dt>기록</dt><dd>{records.length}건</dd></div>
          </dl>
        </section>

        <MonthBars records={records} active={viewMonth} onPick={pickMonth} />
        <CategoryShare categories={data.categories} records={data.records} month={viewMonth} selected={selected} onPick={pickCategory} />
      </div>

      <div className="detail">
        <Calendar records={records} month={viewMonth} day={day} onMonth={pickMonth} onDay={setDay} />

        <section className="ledger" aria-label="기록 내역">
          <div className="ledger-head">
            <span className="ledger-label">{shownLabel}<span className="month-count">{shownRecords.length}건</span></span>
            {day && <button className="ledger-clear" onClick={() => setDay(null)}>월 전체 보기</button>}
            <span className="month-total">{money(shownTotal)}</span>
          </div>
          {!shownRecords.length ? <div className="empty-state">
            <p>{records.length ? (day ? '이날은 기록이 없어요.' : '이 달엔 기록이 없어요.') : '아직 기록이 없어요. 첫 지출을 적어 보세요.'}</p>
            <button className="btn btn-outline" onClick={() => openRecord()}><Icon name="ti-plus" />기록 추가</button></div>
            : <ul className="month-items">{shownRecords.map(record => <li key={record.id}>
              <button className="tx-item" onClick={() => openRecord(record)} aria-label={`${record.name} 수정`}>
                <span className="tx-date"><span className="tx-day">{Number(record.date.slice(8))}</span>{weekday(record.date)}</span>
                <span className="tx-name">{record.name}</span>
                <span className="tx-amount">{money(record.amount)}</span>
              </button>
            </li>)}</ul>}
        </section>
      </div></div> : <div className="empty-state first-use">
        <p className="first-use-title">무엇에 쓰는 돈을 기록할까요?</p>
        <p>게임, 여행, 책처럼 카테고리를 하나 만들면 시작됩니다.</p>
        <button className="btn btn-primary" onClick={() => setModal('categories')}><Icon name="ti-plus" />카테고리 만들기</button></div>}
    </main>

    {modal && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={modal === 'record' ? '기록 편집' : '카테고리 관리'}>
        {modal === 'record' ? <form onSubmit={e => void saveRecord(e)}>
          <h2 className="modal-title">{editing ? '기록 수정' : '기록 추가'}</h2>
          <div className="form-group"><label className="form-label" htmlFor="record-amount">금액 (원)</label>
            <input className="form-input form-amount" id="record-amount" type="number" inputMode="numeric" min="1" step="1" required
              autoFocus={!editing} value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label" htmlFor="record-name">항목명</label>
            <input className="form-input" id="record-name" maxLength={120} required placeholder="예: 스팀 게임 구매"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label" htmlFor="record-category">카테고리</label>
              <select className="form-input" id="record-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label" htmlFor="record-date">날짜</label>
              <input className="form-input" id="record-date" type="date" required value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          </div>
          <div className="modal-actions">{editing && <button className="btn btn-text-danger modal-delete" type="button" onClick={() => void deleteRecord(editing)} disabled={busy}>삭제</button>}
            <button className="btn btn-outline" type="button" onClick={() => setModal(null)}>취소</button>
            <button className="btn btn-primary" type="submit" disabled={busy}>저장</button></div>
        </form> : <>
          <h2 className="modal-title">카테고리 관리</h2>
          {data.categories.length > 0 && <ul className="cat-list">{data.categories.map(c => <li className="cat-item" key={c.id}>
            <Icon name={c.icon} />
            <span className="cat-item-name">{c.name}</span><span className="cat-item-count">{data.records.filter(r => r.category === c.id).length}건</span>
            <button className="icon-btn del" aria-label={`${c.name} 삭제`} onClick={() => void deleteCategory(c)} disabled={busy}><Icon name="ti-trash" /></button>
          </li>)}</ul>}
          <form className="category-form" onSubmit={e => void addCategory(e)}>
            <h3 className="category-form-title">새 카테고리</h3>
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
