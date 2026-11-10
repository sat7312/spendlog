export type Category = { id: string; name: string; icon: string };
export type ExpenseRecord = { id: string; category: string; name: string; amount: number; date: string };
export type SpendlogData = { categories: Category[]; records: ExpenseRecord[] };
export type RecordInput = Omit<ExpenseRecord, 'id'>;

/** 저장·검증 오류입니다. 메시지는 화면에 그대로 보여 줍니다. status는 예전 서버 응답 코드와 맞춥니다. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// 가계부 데이터는 이 키 하나에 { version, categories, records } 형태로 저장합니다.
export const STORAGE_KEY = 'spendlog_data';
const VERSION = 1;
const ICONS = ['ti-device-gamepad-2', 'ti-palette', 'ti-plane', 'ti-music', 'ti-book', 'ti-camera',
  'ti-run', 'ti-trophy', 'ti-pizza', 'ti-shirt', 'ti-ball-football', 'ti-headphones'];
const MIN_DATE = '2000-01-01';
const MAX_AMOUNT = 1_000_000_000;
const DUPLICATE_CATEGORY_NAME = '이미 있는 카테고리 이름입니다';
const STORAGE_UNAVAILABLE = '브라우저 저장소에 접근할 수 없습니다. 브라우저 설정을 확인한 뒤 다시 불러와 주세요';
const STORAGE_CORRUPTED = '저장된 데이터가 손상되었거나 지원하지 않는 형식입니다. 기존 값은 보존했습니다';

const badRequest = (message: string) => new ApiError(message, 400);
const notFound = (label: string) => new ApiError(`${label}을(를) 찾을 수 없습니다`, 404);
const corrupted = () => new ApiError(STORAGE_CORRUPTED, 500);

function storage(): Storage {
  try {
    const s = globalThis.localStorage;
    if (!s) throw new Error('no storage');
    return s;
  } catch {
    throw new ApiError(STORAGE_UNAVAILABLE, 503);
  }
}

const seoulToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

/** 실제로 있는 YYYY-MM-DD 날짜인지 확인합니다. 2월 30일처럼 넘치는 날짜는 거부합니다. */
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function required(value: unknown, label: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length < 1 || trimmed.length > 120) throw badRequest(`${label}을(를) 1~120자로 입력해 주세요`);
  return trimmed;
}

function icon(value: unknown): string {
  if (typeof value !== 'string' || !ICONS.includes(value)) throw badRequest('지원하지 않는 아이콘입니다');
  return value;
}

function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_AMOUNT) {
    throw badRequest('금액은 1원부터 10억 원까지 입력해 주세요');
  }
  return value;
}

function date(value: unknown): string {
  if (value === undefined || value === null || value === '') throw badRequest('날짜를 입력해 주세요');
  // 문자열 비교로 범위를 확인하므로 형식이 맞는지 먼저 봅니다.
  if (!isCalendarDate(value) || value < MIN_DATE || value > seoulToday()) {
    throw badRequest('날짜는 2000-01-01부터 오늘까지 입력해 주세요');
  }
  return value;
}

/** 카테고리 이름은 앞뒤 공백을 제거하고 대소문자를 구분하지 않고 비교합니다. */
const nameKey = (name: string) => name.trim().toLowerCase();

function requireUniqueName(data: SpendlogData, name: string, excludedId: string | null) {
  const key = nameKey(name);
  if (data.categories.some(c => c.id !== excludedId && nameKey(c.name) === key)) {
    throw badRequest(DUPLICATE_CATEGORY_NAME);
  }
}

function newId(): string {
  try { return crypto.randomUUID(); }
  catch { throw new ApiError('새 ID를 만들지 못했습니다. 최신 브라우저에서 다시 시도해 주세요', 500); }
}

/** 저장된 값을 읽어 검증합니다. 값이 없으면 빈 가계부이고, 이상한 값은 고치거나 덮어쓰지 않고 오류로 알립니다. */
function read(): SpendlogData {
  let raw: string | null;
  try { raw = storage().getItem(STORAGE_KEY); }
  catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(STORAGE_UNAVAILABLE, 503); }
  if (raw === null) return { categories: [], records: [] };

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw corrupted(); }
  if (!isObject(parsed) || parsed.version !== VERSION
      || !Array.isArray(parsed.categories) || !Array.isArray(parsed.records)) throw corrupted();

  const categories: Category[] = [];
  const categoryIds = new Set<string>();
  const names = new Set<string>();
  for (const c of parsed.categories) {
    if (!isObject(c) || typeof c.id !== 'string' || c.id === '' || categoryIds.has(c.id)
        || typeof c.name !== 'string' || c.name.trim() === '' || typeof c.icon !== 'string'
        || !ICONS.includes(c.icon) || names.has(nameKey(c.name))) throw corrupted();
    categoryIds.add(c.id);
    names.add(nameKey(c.name));
    categories.push({ id: c.id, name: c.name, icon: c.icon });
  }
  const records: ExpenseRecord[] = [];
  const recordIds = new Set<string>();
  for (const r of parsed.records) {
    // 날짜는 형식만 확인합니다. 시계가 바뀌어도 저장된 기록 때문에 앱이 잠기지 않도록 범위는 보지 않습니다.
    if (!isObject(r) || typeof r.id !== 'string' || r.id === '' || recordIds.has(r.id)
        || typeof r.category !== 'string' || !categoryIds.has(r.category)
        || typeof r.name !== 'string' || r.name.trim() === ''
        || typeof r.amount !== 'number' || !Number.isSafeInteger(r.amount) || r.amount < 1 || r.amount > MAX_AMOUNT
        || !isCalendarDate(r.date)) throw corrupted();
    recordIds.add(r.id);
    records.push({ id: r.id, category: r.category, name: r.name, amount: r.amount, date: r.date });
  }
  return { categories, records };
}

/** 전체 데이터를 한 번에 저장합니다. 실패하면 기존 저장값은 그대로 남습니다. */
function write(data: SpendlogData) {
  const raw = JSON.stringify({ version: VERSION, categories: data.categories, records: data.records });
  try { storage().setItem(STORAGE_KEY, raw); }
  catch (e) {
    if (e instanceof ApiError) throw e;
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    throw new ApiError(quota
      ? '브라우저 저장 공간이 부족해 저장하지 못했습니다. 데이터를 백업한 뒤 브라우저 저장 공간을 확인해 주세요'
      : '브라우저 저장소에 저장하지 못했습니다. 브라우저 설정을 확인해 주세요', 507);
  }
}

/**
 * 변경할 때마다 저장소의 최신 값을 다시 읽어 그 위에 적용합니다.
 * 다른 탭에서 바꾼 내용을 오래된 화면 데이터로 덮어쓰지 않기 위해서입니다.
 */
function update<T>(change: (data: SpendlogData) => { next: SpendlogData; result: T }): Promise<T> {
  return new Promise(resolve => {
    const { next, result } = change(read());
    write(next);
    resolve(result);
  });
}

// 호출한 쪽에서 반환값을 바꿔도 저장 계층에 영향이 없도록 복사본을 돌려줍니다.
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function findCategory(data: SpendlogData, id: unknown): Category {
  const found = typeof id === 'string' ? data.categories.find(c => c.id === id) : undefined;
  if (!found) throw notFound('카테고리');
  return found;
}

function findRecord(data: SpendlogData, id: string): ExpenseRecord {
  const found = data.records.find(r => r.id === id);
  if (!found) throw notFound('기록');
  return found;
}

function recordFields(data: SpendlogData, input: RecordInput) {
  return {
    category: findCategory(data, input?.category).id,
    name: required(input?.name, '항목명'),
    amount: amount(input?.amount),
    date: date(input?.date),
  };
}

/** 백업 파일 내용을 검증하고 새 ID로 바꾼 데이터를 만듭니다. 하나라도 잘못되면 아무것도 바꾸지 않습니다. */
function fromBackup(input: unknown): SpendlogData {
  if (!isObject(input) || !Array.isArray(input.categories) || !Array.isArray(input.records)) {
    throw badRequest('올바른 백업 파일이 아닙니다');
  }
  const byBackupId = new Map<string, Category>();
  const names = new Set<string>();
  for (const c of input.categories) {
    if (!isObject(c)) throw badRequest('올바른 카테고리 데이터가 아닙니다');
    const backupId = required(c.id, '카테고리 ID');
    const category = { id: newId(), name: required(c.name, '카테고리 이름'), icon: icon(c.icon) };
    if (byBackupId.has(backupId)) throw badRequest('카테고리 ID가 중복되었습니다');
    byBackupId.set(backupId, category);
    if (names.has(nameKey(category.name))) throw badRequest(DUPLICATE_CATEGORY_NAME);
    names.add(nameKey(category.name));
  }
  const records = input.records.map(r => {
    if (!isObject(r)) throw badRequest('올바른 기록 데이터가 아닙니다');
    const category = typeof r.category === 'string' ? byBackupId.get(r.category) : undefined;
    if (!category) throw badRequest('기록의 카테고리를 찾을 수 없습니다');
    return { id: newId(), category: category.id, name: required(r.name, '항목명'), amount: amount(r.amount), date: date(r.date) };
  });
  return { categories: [...byBackupId.values()], records };
}

export const api = {
  data: () => new Promise<SpendlogData>(resolve => resolve(read())),
  addCategory: (name: string, iconName: string) => update(data => {
    const category = { id: '', name: required(name, '카테고리 이름'), icon: icon(iconName) };
    requireUniqueName(data, category.name, null);
    category.id = newId();
    return { next: { ...data, categories: [...data.categories, category] }, result: copy(category) };
  }),
  /** 이름과 아이콘만 바꾸므로 ID가 유지되어 기록은 그대로 남습니다. */
  updateCategory: (id: string, name: string, iconName: string) => update(data => {
    const current = findCategory(data, id);
    const category = { id: current.id, name: required(name, '카테고리 이름'), icon: icon(iconName) };
    requireUniqueName(data, category.name, current.id);
    return {
      next: { ...data, categories: data.categories.map(c => c.id === id ? category : c) },
      result: copy(category),
    };
  }),
  deleteCategory: (id: string) => update<void>(data => {
    findCategory(data, id);
    return {
      next: { categories: data.categories.filter(c => c.id !== id), records: data.records.filter(r => r.category !== id) },
      result: undefined,
    };
  }),
  addRecord: (input: RecordInput) => update(data => {
    const fields = recordFields(data, input);
    const record = { id: newId(), ...fields };
    return { next: { ...data, records: [...data.records, record] }, result: copy(record) };
  }),
  updateRecord: (id: string, input: RecordInput) => update(data => {
    findRecord(data, id);
    const record = { id, ...recordFields(data, input) };
    return { next: { ...data, records: data.records.map(r => r.id === id ? record : r) }, result: copy(record) };
  }),
  deleteRecord: (id: string) => update<void>(data => {
    findRecord(data, id);
    return { next: { ...data, records: data.records.filter(r => r.id !== id) }, result: undefined };
  }),
  /** 전체 데이터를 백업 내용으로 교체합니다. 백업 파일의 ID는 참조 연결에만 쓰고 새 ID를 발급합니다. */
  restore: (input: SpendlogData) => update(() => {
    const next = fromBackup(input);
    return { next, result: copy(next) };
  }),
};
