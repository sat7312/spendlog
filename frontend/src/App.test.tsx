import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api, ApiError, STORAGE_KEY, type SpendlogData } from './api';

const today = (() => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
})();
const category = { id: 'c1', name: '게임', icon: 'ti-device-gamepad-2' };
const record = { id: 'r1', category: 'c1', name: '스팀', amount: 52000, date: today };
const initial: SpendlogData = { categories: [category], records: [record] };

type Call = { method: string; name: string };
const methods = {
  addCategory: 'POST', addRecord: 'POST', updateCategory: 'PUT', updateRecord: 'PUT', restore: 'PUT',
  deleteCategory: 'DELETE', deleteRecord: 'DELETE',
} as const;

/**
 * 저장 계층(api)을 흉내 냅니다. api.data()는 get에 넣은 순서대로 응답하고(비면 current),
 * 변경 메서드는 mutation이 돌려준 값을 씁니다. Error를 돌려주면 그 오류로 실패합니다.
 * 호출은 예전 HTTP 메서드 이름(GET/POST/PUT/DELETE)으로 기록합니다.
 */
function stubServer(options: {
  get: ('current' | Error)[];
  mutation?: (call: Call) => unknown;
}) {
  const calls: Call[] = [];
  vi.spyOn(api, 'data').mockImplementation(async () => {
    calls.push({ method: 'GET', name: 'data' });
    const next = options.get.shift();
    if (next instanceof Error) throw next;
    return structuredClone(initial);
  });
  for (const [name, method] of Object.entries(methods)) {
    vi.spyOn(api, name as keyof typeof methods).mockImplementation((async () => {
      const call = { method, name };
      calls.push(call);
      const result = options.mutation?.(call);
      if (result instanceof Error) throw result;
      return result;
    }) as never);
  }
  const count = (method: string) => calls.filter(c => c.method === method).length;
  return { calls, count };
}

const failureText = '브라우저 저장소에 접근할 수 없습니다';
const failure = () => new ApiError(failureText, 503);
const staleText = /변경 사항은 반영되었지만 목록을 새로 불러오지 못했습니다/;

async function renderApp() {
  render(<App />);
  await screen.findByRole('button', { name: '스팀 수정' });
}

/** 재조회 실패 안내가 뜨고, 변경 버튼이 잠기고, 다시 불러오면 조회만 다시 하는지 확인합니다. */
async function expectStaleThenRecover(server: ReturnType<typeof stubServer>, method: string) {
  expect(await screen.findByText(staleText)).toBeTruthy();
  expect(screen.getByText(staleText).textContent).toContain(failureText);
  const addButton = screen.getAllByRole('button', { name: '기록 추가' })[0] as HTMLButtonElement;
  expect(addButton.disabled).toBe(true);
  expect(server.count(method)).toBe(1);

  const getsBefore = server.count('GET');
  fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
  await waitFor(() => expect(screen.queryByText(staleText)).toBeNull());
  expect(server.count('GET')).toBe(getsBefore + 1);
  expect(server.count(method)).toBe(1);
  expect(server.calls.filter(c => c.method !== 'GET')).toHaveLength(1);
  expect((screen.getAllByRole('button', { name: '기록 추가' })[0] as HTMLButtonElement).disabled).toBe(false);
}

/** Node 버전에 따라 전역 localStorage가 jsdom 것이 아닐 수 있어 메모리 저장소를 씁니다. */
function stubStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('서버 요청을 보내면 안 됩니다'); }));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  return values;
}

beforeEach(() => {
  stubStorage();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('App when the change succeeds but reloading fails', () => {
  it('closes the form after creating a record and only retries GET', async () => {
    const server = stubServer({ get: ['current', failure()],
      mutation: () => ({ ...record, id: 'r2', name: '패키지', amount: 30000 }) });
    await renderApp();

    fireEvent.click(screen.getAllByRole('button', { name: '기록 추가' })[0]);
    fireEvent.change(screen.getByLabelText('금액 (원)'), { target: { value: '30000' } });
    fireEvent.change(screen.getByLabelText('항목명'), { target: { value: '패키지' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expectStaleThenRecover(server, 'POST');
  });

  it('closes the form after updating a record', async () => {
    const server = stubServer({ get: ['current', failure()], mutation: () => ({ ...record, name: '스팀 게임' }) });
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: '스팀 수정' }));
    fireEvent.change(screen.getByLabelText('항목명'), { target: { value: '스팀 게임' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expectStaleThenRecover(server, 'PUT');
  });

  it('closes the form after deleting a record', async () => {
    const server = stubServer({ get: ['current', failure()], mutation: () => undefined });
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: '스팀 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expectStaleThenRecover(server, 'DELETE');
  });

  it('closes the category manager after updating a category', async () => {
    const server = stubServer({ get: ['current', failure()], mutation: () => ({ ...category, name: '게임기' }) });
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: '메뉴' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '카테고리 관리' }));
    fireEvent.click(screen.getByRole('button', { name: '게임 수정' }));
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '게임기' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expectStaleThenRecover(server, 'PUT');
  });

  it('closes the category manager after deleting a category', async () => {
    const server = stubServer({ get: ['current', failure()], mutation: () => undefined });
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: '메뉴' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '카테고리 관리' }));
    fireEvent.click(screen.getByRole('button', { name: '게임 삭제' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expectStaleThenRecover(server, 'DELETE');
  });

  it('reports a restore as applied when reloading fails', async () => {
    const server = stubServer({ get: ['current', failure()], mutation: () => initial });
    await renderApp();

    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File([JSON.stringify(initial)], 'backup.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    await expectStaleThenRecover(server, 'PUT');
  });

  it('blocks further changes until reloading succeeds', async () => {
    const server = stubServer({ get: ['current', failure(), failure()],
      mutation: () => ({ ...record, name: '스팀 게임' }) });
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: '스팀 수정' }));
    fireEvent.change(screen.getByLabelText('항목명'), { target: { value: '스팀 게임' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText(staleText)).toBeTruthy();

    // 수정 창을 다시 열어도 저장·삭제는 잠겨 있습니다.
    fireEvent.click(screen.getByRole('button', { name: '스팀 수정' }));
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '삭제' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    // 다시 불러오기도 실패하면 잠금이 유지됩니다.
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByText(/데이터를 불러오지 못했습니다/)).toBeTruthy();
    expect((screen.getAllByRole('button', { name: '기록 추가' })[0] as HTMLButtonElement).disabled).toBe(true);
    expect(server.count('PUT')).toBe(1);
  });
});

describe('App when the change request fails', () => {
  it('keeps the form input and does not treat it as success', async () => {
    const server = stubServer({ get: ['current'], mutation: () => new ApiError('금액은 1원부터 10억 원까지 입력해 주세요', 400) });
    await renderApp();

    fireEvent.click(screen.getAllByRole('button', { name: '기록 추가' })[0]);
    fireEvent.change(screen.getByLabelText('금액 (원)'), { target: { value: '30000' } });
    fireEvent.change(screen.getByLabelText('항목명'), { target: { value: '패키지' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('금액은 1원부터 10억 원까지 입력해 주세요')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('금액 (원)') as HTMLInputElement).value).toBe('30000');
    expect((screen.getByLabelText('항목명') as HTMLInputElement).value).toBe('패키지');
    expect(screen.queryByText(staleText)).toBeNull();
    expect(server.count('POST')).toBe(1);
    expect(server.count('GET')).toBe(1);
  });
});

describe('App theme without storage', () => {
  it('renders with the default theme and still toggles', async () => {
    const blocked = () => { throw new DOMException('storage blocked', 'SecurityError'); };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    stubServer({ get: ['current'] });
    await renderApp();

    expect(document.body.dataset.theme).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: '다크 모드로 전환' }));
    expect(document.body.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: '라이트 모드로 전환' })).toBeTruthy();
  });
});

describe('App with browser storage', () => {
  const stored = (values: Map<string, string>) => JSON.parse(values.get(STORAGE_KEY) ?? 'null');

  it('shows the ledger right away from storage without any server request or logout menu', async () => {
    const values = stubStorage();
    values.set(STORAGE_KEY, JSON.stringify({ version: 1, ...initial }));
    await renderApp();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '메뉴' }));
    expect(screen.getByRole('menuitem', { name: /데이터 백업/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /로그아웃/ })).toBeNull();
  });

  it('keeps created categories and records after remounting', async () => {
    const values = stubStorage();
    render(<App />);
    await waitFor(() => expect(document.querySelector('.first-use')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: '메뉴' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '카테고리 관리' }));
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '여행' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await waitFor(() => expect(stored(values)?.categories).toHaveLength(1));
    // 카테고리를 추가하면 창이 닫히고 그 카테고리가 선택됩니다.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getAllByRole('button', { name: '기록 추가' })[0]);
    fireEvent.change(screen.getByLabelText('금액 (원)'), { target: { value: '300000' } });
    fireEvent.change(screen.getByLabelText('항목명'), { target: { value: '항공권' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(stored(values)?.records).toHaveLength(1));

    cleanup();
    render(<App />);
    expect(await screen.findByRole('button', { name: '항공권 수정' })).toBeTruthy();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('locks changes and backup when stored data is corrupted, keeping the stored value', async () => {
    const values = stubStorage();
    values.set(STORAGE_KEY, '{not json');
    render(<App />);
    expect(await screen.findByText(/저장된 데이터가 손상되었거나/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '메뉴' }));
    expect((screen.getByRole('menuitem', { name: /데이터 백업/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('menuitem', { name: /데이터 복원/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: '카테고리 관리' }));
    expect((screen.getByRole('button', { name: '추가' }) as HTMLButtonElement).disabled).toBe(true);
    expect(values.get(STORAGE_KEY)).toBe('{not json');
  });
});
