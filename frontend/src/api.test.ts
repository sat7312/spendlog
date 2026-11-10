import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, STORAGE_KEY, type SpendlogData } from './api';

type Failing = 'getItem' | 'setItem';

/** 메모리 저장소입니다. failing에 넣은 메서드는 error로 실패합니다. */
function stubStorage(failing: Failing[] = [], error: () => Error = () => new DOMException('blocked', 'SecurityError')) {
  const values = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => {
    if (failing.includes('setItem')) throw error();
    values.set(key, value);
  });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => {
      if (failing.includes('getItem')) throw error();
      return values.get(key) ?? null;
    },
    setItem,
    removeItem: (key: string) => { values.delete(key); },
  });
  return { values, setItem };
}

const BACKUP: SpendlogData = {
  categories: [{ id: 'games', name: '게임', icon: 'ti-device-gamepad-2' }],
  records: [{ id: 'r1', category: 'games', name: '스팀', amount: 52000, date: '2026-06-02' }],
};
const DATE_RANGE_ERROR = '날짜는 2000-01-01부터 오늘까지 입력해 주세요';
const AMOUNT_ERROR = '금액은 1원부터 10억 원까지 입력해 주세요';
const DUPLICATE_ERROR = '이미 있는 카테고리 이름입니다';
const ICON_ERROR = '지원하지 않는 아이콘입니다';

const record = (category: string, overrides: Record<string, unknown> = {}) =>
  ({ category, name: '점심', amount: 12000, date: '2026-06-01', ...overrides }) as never;

let storage: ReturnType<typeof stubStorage>;

beforeEach(() => {
  vi.unstubAllGlobals();
  // UTC로는 2026-06-01이지만 서울 기준으로는 2026-06-02인 시각으로 '오늘'을 고정합니다.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-01T15:30:00Z'));
  storage = stubStorage();
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('서버 요청을 보내면 안 됩니다'); }));
});
afterEach(() => {
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('reading and writing', () => {
  it('starts empty without writing anything', async () => {
    await expect(api.data()).resolves.toEqual({ categories: [], records: [] });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('stores a versioned envelope and reads it back', async () => {
    const c = await api.addCategory(' 여행 ', 'ti-plane');
    expect(c.name).toBe('여행');
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toEqual({ version: 1, categories: [c], records: [] });
    await expect(api.data()).resolves.toEqual({ categories: [c], records: [] });
  });

  it('returns copies that cannot change stored data', async () => {
    await api.restore(BACKUP);
    const data = await api.data();
    data.categories[0].name = '바뀜';
    data.records.length = 0;
    const again = await api.data();
    expect(again.categories[0].name).toBe('게임');
    expect(again.records).toHaveLength(1);
  });
});

describe('categories and records', () => {
  it('updates a category keeping its id and records, and moves records', async () => {
    const restored = await api.restore(BACKUP);
    const games = restored.categories[0].id;
    const recordId = restored.records[0].id;
    await expect(api.updateCategory(games, ' 비디오 게임 ', 'ti-trophy'))
      .resolves.toEqual({ id: games, name: '비디오 게임', icon: 'ti-trophy' });
    const travel = await api.addCategory('여행', 'ti-plane');
    await expect(api.updateRecord(recordId, record(travel.id))).resolves.toMatchObject({ id: recordId, category: travel.id });
    const data = await api.data();
    expect(data.records).toEqual([{ id: recordId, category: travel.id, name: '점심', amount: 12000, date: '2026-06-01' }]);
  });

  it('deletes a category together with its records in one write', async () => {
    const restored = await api.restore(BACKUP);
    const other = await api.addCategory('여행', 'ti-plane');
    await api.addRecord(record(other.id));
    storage.setItem.mockClear();
    await api.deleteCategory(restored.categories[0].id);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const data = await api.data();
    expect(data.categories.map(c => c.name)).toEqual(['여행']);
    expect(data.records).toHaveLength(1);
    expect(data.records[0].category).toBe(other.id);
  });

  it('deletes a record', async () => {
    const restored = await api.restore(BACKUP);
    await api.deleteRecord(restored.records[0].id);
    await expect(api.data()).resolves.toMatchObject({ records: [] });
  });

  it('rejects missing ids with 404 and leaves data unchanged', async () => {
    const restored = await api.restore(BACKUP);
    const before = storage.values.get(STORAGE_KEY);
    const category = restored.categories[0].id;
    const attempts = [
      () => api.updateCategory('missing', '여행', 'ti-plane'),
      () => api.deleteCategory('missing'),
      () => api.updateRecord('missing', record(category)),
      () => api.deleteRecord('missing'),
      () => api.addRecord(record('missing')),
      () => api.updateRecord(restored.records[0].id, record('missing')),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toMatchObject({ status: 404 });
    }
    expect(storage.values.get(STORAGE_KEY)).toBe(before);
  });
});

describe('validation', () => {
  let category: string;
  let recordId: string;
  let before: string | undefined;
  beforeEach(async () => {
    const restored = await api.restore(BACKUP);
    category = restored.categories[0].id;
    recordId = restored.records[0].id;
    before = storage.values.get(STORAGE_KEY);
  });

  /** 추가·수정·복원 모두 같은 메시지로 거부하고 데이터를 바꾸지 않는지 확인합니다. */
  async function expectRejectedEverywhere(fields: Record<string, unknown>, message: string) {
    await expect(api.addRecord(record(category, fields))).rejects.toThrow(message);
    await expect(api.updateRecord(recordId, record(category, fields))).rejects.toThrow(message);
    const backup = { categories: BACKUP.categories, records: [BACKUP.records[0], { id: 'r2', ...record('games', fields) as object }] };
    await expect(api.restore(backup as SpendlogData)).rejects.toThrow(message);
    expect(storage.values.get(STORAGE_KEY)).toBe(before);
  }

  it('accepts dates from 2000-01-01 to Seoul today', async () => {
    for (const date of ['2000-01-01', '2024-02-29', '2026-06-01', '2026-06-02']) {
      await expect(api.addRecord(record(category, { date }))).resolves.toMatchObject({ date });
    }
  });

  it('rejects dates outside the range or not on the calendar', async () => {
    for (const date of ['1999-12-31', '2026-06-03', '2023-02-29', '2026-02-30', '2026-6-1', '2026-06-01T00:00']) {
      await expectRejectedEverywhere({ date }, DATE_RANGE_ERROR);
    }
    for (const date of [null, undefined, '']) {
      await expectRejectedEverywhere({ date }, '날짜를 입력해 주세요');
    }
  });

  it('accepts amounts from 1 to one billion and rejects everything else', async () => {
    for (const amount of [1, 1_000_000_000]) {
      await expect(api.addRecord(record(category, { amount }))).resolves.toMatchObject({ amount });
    }
    before = storage.values.get(STORAGE_KEY);
    for (const amount of [0, -1, 1_000_000_001, 1.5, '1000', Number.NaN, Number.POSITIVE_INFINITY, null]) {
      await expectRejectedEverywhere({ amount }, AMOUNT_ERROR);
    }
  });

  it('trims names and requires 1 to 120 characters after trimming', async () => {
    await expect(api.addRecord(record(category, { name: `  ${'가'.repeat(120)}  ` })))
      .resolves.toMatchObject({ name: '가'.repeat(120) });
    before = storage.values.get(STORAGE_KEY);
    for (const name of ['   ', '가'.repeat(121), null, 3]) {
      await expectRejectedEverywhere({ name }, '항목명을(를) 1~120자로 입력해 주세요');
    }
    await expect(api.addCategory('   ', 'ti-plane')).rejects.toThrow('카테고리 이름을(를) 1~120자로 입력해 주세요');
  });

  it('rejects missing, null or unsupported icons', async () => {
    for (const icon of [undefined, null, 'ti-unknown']) {
      await expect(api.addCategory('여행', icon as never)).rejects.toThrow(ICON_ERROR);
      await expect(api.updateCategory(category, '게임', icon as never)).rejects.toThrow(ICON_ERROR);
      await expect(api.restore({ categories: [{ id: 'a', name: 'A', icon }], records: [] } as never)).rejects.toThrow(ICON_ERROR);
    }
    expect(storage.values.get(STORAGE_KEY)).toBe(before);
  });

  it('rejects duplicate category names ignoring case and spaces, except the category itself', async () => {
    const travel = await api.addCategory('Travel', 'ti-plane');
    for (const name of ['게임', ' 게임 ', 'travel', ' TRAVEL ']) {
      await expect(api.addCategory(name, 'ti-music')).rejects.toThrow(DUPLICATE_ERROR);
    }
    await expect(api.updateCategory(travel.id, '게임', 'ti-plane')).rejects.toThrow(DUPLICATE_ERROR);
    await expect(api.updateCategory(travel.id, ' travel ', 'ti-camera')).resolves.toMatchObject({ name: 'travel' });
  });
});

describe('restore', () => {
  it('replaces everything with new ids and relinks records', async () => {
    await api.addCategory('여행', 'ti-plane');
    const restored = await api.restore({
      categories: [{ id: 'a', name: '게임', icon: 'ti-device-gamepad-2' }, { id: 'b', name: ' 여행 ', icon: 'ti-plane' }],
      records: [{ id: 'dup', category: 'b', name: '항공권', amount: 300000, date: '2026-06-01' },
        { id: 'dup', category: 'b', name: '호텔', amount: 100000, date: '2026-06-02' }],
    });
    const travel = restored.categories.find(c => c.name === '여행')!;
    expect(restored.categories.map(c => c.id)).not.toContain('a');
    expect(travel.id).not.toBe('b');
    expect(restored.records.map(r => r.category)).toEqual([travel.id, travel.id]);
    expect(new Set(restored.records.map(r => r.id)).size).toBe(2);
    await expect(api.data()).resolves.toEqual(restored);
  });

  it('accepts an empty backup as a full reset', async () => {
    await api.restore(BACKUP);
    await expect(api.restore({ categories: [], records: [] })).resolves.toEqual({ categories: [], records: [] });
  });

  it('rejects the whole backup when a later item is invalid', async () => {
    await api.restore(BACKUP);
    const before = storage.values.get(STORAGE_KEY);
    storage.setItem.mockClear();
    const good = [{ id: 'a', name: 'A', icon: 'ti-plane' }, { id: 'b', name: 'B', icon: 'ti-music' }];
    const cases: [unknown, string][] = [
      [{ categories: [...good, { id: 'c', name: 'C' }], records: [] }, ICON_ERROR],
      [{ categories: [...good, { id: 'c', name: ' ', icon: 'ti-plane' }], records: [] }, '카테고리 이름'],
      [{ categories: [...good, null], records: [] }, '올바른 카테고리 데이터가 아닙니다'],
      [{ categories: [...good, { id: 'a', name: 'C', icon: 'ti-plane' }], records: [] }, '카테고리 ID가 중복되었습니다'],
      [{ categories: [...good, { id: 'c', name: ' a ', icon: 'ti-plane' }], records: [] }, DUPLICATE_ERROR],
      [{ categories: good, records: [{ id: 'r', category: 'zzz', name: 'x', amount: 1, date: '2026-06-01' }] }, '기록의 카테고리를 찾을 수 없습니다'],
      [{ categories: good, records: [null] }, '올바른 기록 데이터가 아닙니다'],
      [{ categories: good }, '올바른 백업 파일이 아닙니다'],
      [[], '올바른 백업 파일이 아닙니다'],
    ];
    for (const [backup, message] of cases) {
      await expect(api.restore(backup as SpendlogData)).rejects.toThrow(message);
    }
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.values.get(STORAGE_KEY)).toBe(before);
  });
});

describe('storage problems', () => {
  it('reports an unreachable storage instead of showing empty data', async () => {
    stubStorage(['getItem']);
    await expect(api.data()).rejects.toThrow('브라우저 저장소에 접근할 수 없습니다');
    await expect(api.addCategory('여행', 'ti-plane')).rejects.toThrow('브라우저 저장소에 접근할 수 없습니다');
  });

  it('reports when localStorage itself cannot be accessed', async () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new DOMException('no', 'SecurityError'); } });
    try {
      await expect(api.data()).rejects.toThrow('브라우저 저장소에 접근할 수 없습니다');
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('keeps the old value when the quota is exceeded', async () => {
    await api.restore(BACKUP);
    const before = storage.values.get(STORAGE_KEY);
    const values = storage.values;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem: () => {},
    });
    await expect(api.addCategory('여행', 'ti-plane')).rejects.toThrow('저장 공간이 부족해');
    expect(values.get(STORAGE_KEY)).toBe(before);
  });

  it('reports other write failures without claiming success', async () => {
    stubStorage(['setItem']);
    await expect(api.addCategory('여행', 'ti-plane')).rejects.toThrow('브라우저 저장소에 저장하지 못했습니다');
  });

  it.each([
    ['broken JSON', '{not json'],
    ['empty string', ''],
    ['JSON null', 'null'],
    ['array', '[]'],
    ['unknown version', JSON.stringify({ version: 2, categories: [], records: [] })],
    ['wrong field type', JSON.stringify({ version: 1, categories: [{ id: 'a', name: 1, icon: 'ti-plane' }], records: [] })],
    ['duplicate ids', JSON.stringify({ version: 1, categories: [
      { id: 'a', name: 'A', icon: 'ti-plane' }, { id: 'a', name: 'B', icon: 'ti-plane' }], records: [] })],
    ['orphan record', JSON.stringify({ version: 1, categories: [],
      records: [{ id: 'r', category: 'x', name: 'n', amount: 1, date: '2026-06-01' }] })],
  ])('never overwrites corrupted data (%s)', async (_label, raw) => {
    storage.values.set(STORAGE_KEY, raw);
    const message = '저장된 데이터가 손상되었거나';
    await expect(api.data()).rejects.toThrow(message);
    await expect(api.addCategory('여행', 'ti-plane')).rejects.toThrow(message);
    await expect(api.deleteCategory('a')).rejects.toThrow(message);
    await expect(api.restore(BACKUP)).rejects.toThrow(message);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.values.get(STORAGE_KEY)).toBe(raw);
  });

  it('still reads stored records dated after today (clock changes do not lock the app)', async () => {
    storage.values.set(STORAGE_KEY, JSON.stringify({ version: 1, categories: BACKUP.categories,
      records: [{ ...BACKUP.records[0], date: '2027-01-01' }] }));
    await expect(api.data()).resolves.toMatchObject({ records: [{ date: '2027-01-01' }] });
  });

  it('keeps the HTTP-like status on errors', async () => {
    const error = await api.addCategory(' ', 'ti-plane').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400 });
  });
});

describe('multiple tabs', () => {
  it('applies each change on top of the latest stored data', async () => {
    const first = await api.addCategory('게임', 'ti-device-gamepad-2');
    // 다른 탭이 그 사이에 카테고리를 추가한 상황입니다.
    const other = { id: 'other-tab', name: '여행', icon: 'ti-plane' };
    storage.values.set(STORAGE_KEY, JSON.stringify({ version: 1, categories: [first, other], records: [] }));

    await expect(api.addCategory(' 여행 ', 'ti-music')).rejects.toThrow(DUPLICATE_ERROR);
    await api.addCategory('음악', 'ti-music');
    const names = (await api.data()).categories.map(c => c.name);
    expect(names).toEqual(['게임', '여행', '음악']);

    // 다른 탭이 지운 카테고리는 수정할 수 없습니다.
    storage.values.set(STORAGE_KEY, JSON.stringify({ version: 1, categories: [other], records: [] }));
    await expect(api.updateCategory(first.id, '게임기', 'ti-trophy')).rejects.toMatchObject({ status: 404 });
  });
});
