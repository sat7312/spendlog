import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { SpendlogData } from './api';

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { method: string; path: string };

/**
 * 서버를 흉내 냅니다. GET /data는 getResults에 넣은 순서대로 응답하고(비면 current),
 * 그 밖의 요청은 mutation이 돌려준 응답을 씁니다.
 */
function stubServer(options: {
  get: (Response | 'current')[];
  mutation?: (call: Call) => Response;
}) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const call = { method: init?.method ?? 'GET', path: url.replace(/^.*\/api/, '') };
    calls.push(call);
    if (call.method === 'GET') {
      const next = options.get.shift();
      return next && next !== 'current' ? next : json(initial);
    }
    return options.mutation?.(call) ?? json({});
  }));
  const count = (method: string) => calls.filter(c => c.method === method).length;
  return { calls, count };
}

const failure = () => json({ detail: '서버 점검 중입니다' }, 503);
const staleText = /변경 사항은 반영되었지만 목록을 새로 불러오지 못했습니다/;

async function renderApp() {
  render(<App />);
  await screen.findByRole('button', { name: '스팀 수정' });
}

/** 재조회 실패 안내가 뜨고, 변경 버튼이 잠기고, 다시 불러오면 GET만 보내는지 확인합니다. */
async function expectStaleThenRecover(server: ReturnType<typeof stubServer>, method: string) {
  expect(await screen.findByText(staleText)).toBeTruthy();
  expect(screen.getByText(staleText).textContent).toContain('서버 점검 중입니다');
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
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
}

beforeEach(() => {
  stubStorage();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('App when the change succeeds but reloading fails', () => {
  it('closes the form after creating a record and only retries GET', async () => {
    const server = stubServer({ get: ['current', failure()],
      mutation: () => json({ ...record, id: 'r2', name: '패키지', amount: 30000 }) });
    await renderApp();

    fireEvent.click(screen.getAllByRole('button', { name: '기록 추가' })[0]);
    fireEvent.change(screen.getByLabelText('금액 (원)'), { target: { value: '30000' } });
    fireEvent.change(screen.getByLabelText('항목명'), { target: { value: '패키지' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expectStaleThenRecover(server, 'POST');
  });

  it('closes the form after updating a record', async () => {
    const server = stubServer({ get: ['current', failure()], mutation: () => json({ ...record, name: '스팀 게임' }) });
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: '스팀 수정' }));
    fireEvent.change(screen.getByLabelText('항목명'), { target: { value: '스팀 게임' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expectStaleThenRecover(server, 'PUT');
  });

  it('closes the form after deleting a record', async () => {
    const server = stubServer({ get: ['current', failure()], mutation: () => new Response(null, { status: 204 }) });
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: '스팀 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expectStaleThenRecover(server, 'DELETE');
  });

  it('closes the category manager after updating a category', async () => {
    const server = stubServer({ get: ['current', failure()], mutation: () => json({ ...category, name: '게임기' }) });
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
    const server = stubServer({ get: ['current', failure()], mutation: () => new Response(null, { status: 204 }) });
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: '메뉴' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '카테고리 관리' }));
    fireEvent.click(screen.getByRole('button', { name: '게임 삭제' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expectStaleThenRecover(server, 'DELETE');
  });

  it('reports a restore as applied when reloading fails', async () => {
    const server = stubServer({ get: ['current', failure()], mutation: () => json(initial) });
    await renderApp();

    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File([JSON.stringify(initial)], 'backup.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    await expectStaleThenRecover(server, 'PUT');
  });

  it('blocks further changes until reloading succeeds', async () => {
    const server = stubServer({ get: ['current', failure(), failure()],
      mutation: () => json({ ...record, name: '스팀 게임' }) });
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
    const server = stubServer({ get: ['current'], mutation: () => json({ detail: '금액은 1원부터 10억 원까지 입력해 주세요' }, 400) });
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

describe('local app without login', () => {
  it('shows the ledger right away and has no logout menu', async () => {
    stubServer({ get: ['current'] });
    await renderApp();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/data']);
    fireEvent.click(screen.getByRole('button', { name: '메뉴' }));
    expect(screen.getByRole('menuitem', { name: /데이터 백업/ })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /로그아웃/ })).toBeNull();
  });
});
