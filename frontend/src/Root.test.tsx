import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Root from './Root';

vi.mock('./App', () => ({ default: ({ user }: { user: { name: string } }) => <div>가계부 {user.name}</div> }));
vi.mock('./Login', () => ({ default: () => <div>로그인 화면</div> }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const user = { email: 'alice@example.com', name: 'Alice' };

/** 응답 또는 예외를 순서대로 돌려주는 fetch를 설치합니다. */
function stubFetch(...results: (Response | Error | Promise<Response>)[]) {
  const fetch = vi.fn(async () => {
    const next = results.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('unexpected request');
    return next;
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** Node 버전에 따라 전역 localStorage가 jsdom 것이 아닐 수 있어 메모리 저장소를 씁니다. */
function stubStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => { values.clear(); },
  });
}

beforeEach(() => {
  stubStorage();
  localStorage.setItem('spendlog_token', 'token-1');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Root initial auth check', () => {
  it('shows the ledger when the token is valid', async () => {
    stubFetch(json(user));
    render(<Root />);
    expect(await screen.findByText('가계부 Alice')).toBeTruthy();
  });

  it.each([
    ['network error', new TypeError('Failed to fetch')],
    ['503', json({ detail: '서버 점검 중입니다' }, 503)],
  ])('keeps the token and offers retry on %s', async (_label, failure) => {
    const fetch = stubFetch(failure, json(user));
    render(<Root />);

    const retry = await screen.findByRole('button', { name: '다시 시도' });
    expect(screen.queryByText(/가계부/)).toBeNull();
    expect(screen.queryByText('로그인 화면')).toBeNull();
    expect(localStorage.getItem('spendlog_token')).toBe('token-1');

    fireEvent.click(retry);
    expect(await screen.findByText('가계부 Alice')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('removes the token and shows login on 401', async () => {
    stubFetch(json({ message: 'expired' }, 401));
    render(<Root />);
    expect(await screen.findByText('로그인 화면')).toBeTruthy();
    expect(localStorage.getItem('spendlog_token')).toBeNull();
  });

  it('removes the token when retry gets 401', async () => {
    stubFetch(new TypeError('Failed to fetch'), json({ message: 'expired' }, 401));
    render(<Root />);
    fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('로그인 화면')).toBeTruthy();
    expect(localStorage.getItem('spendlog_token')).toBeNull();
  });

  it('does not send duplicate checks on repeated retry clicks', async () => {
    let resolve: (response: Response) => void = () => {};
    const pending = new Promise<Response>(r => { resolve = r; });
    const fetch = stubFetch(new TypeError('Failed to fetch'), pending);
    render(<Root />);

    const retry = await screen.findByRole('button', { name: '다시 시도' });
    fireEvent.click(retry);
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((retry as HTMLButtonElement).disabled).toBe(true);

    await act(async () => { resolve(json(user)); });
    expect(await screen.findByText('가계부 Alice')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shows login without a request when there is no token', () => {
    localStorage.clear();
    const fetch = stubFetch();
    render(<Root />);
    expect(screen.getByText('로그인 화면')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});
