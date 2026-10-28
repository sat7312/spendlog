import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Failing = 'getItem' | 'setItem' | 'removeItem';

/** 지정한 메서드만 예외를 던지는 저장소입니다. */
function stubStorage(failing: Failing[] = []) {
  const values = new Map<string, string>();
  const fail = (name: Failing) => {
    if (failing.includes(name)) throw new DOMException('storage blocked', 'SecurityError');
  };
  const storage = {
    getItem: (key: string) => { fail('getItem'); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => { fail('setItem'); values.set(key, value); },
    removeItem: (key: string) => { fail('removeItem'); values.delete(key); },
  };
  vi.stubGlobal('localStorage', storage);
  return values;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** fetch 응답을 순서대로 돌려주고, 각 요청의 Authorization 헤더를 기록합니다. */
function stubFetch(...responses: Response[]) {
  const headers: (string | undefined)[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    headers.push((init?.headers as Record<string, string> | undefined)?.Authorization);
    return responses.shift() ?? json({ categories: [], records: [] });
  }));
  return headers;
}

// 모듈 안의 메모리 토큰 상태를 테스트마다 새로 시작합니다.
const loadApi = async () => {
  vi.resetModules();
  return import('./api');
};

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('auth with working storage', () => {
  it('saves, restores after reload and clears the token', async () => {
    const values = stubStorage();
    let { auth } = await loadApi();
    auth.save('token-1');
    expect(auth.token()).toBe('token-1');
    expect(values.get('spendlog_token')).toBe('token-1');

    ({ auth } = await loadApi());
    expect(auth.token()).toBe('token-1');

    auth.clear();
    expect(auth.token()).toBeNull();
    expect(values.has('spendlog_token')).toBe(false);
  });
});

describe.each<Failing[]>([['getItem'], ['setItem'], ['removeItem'], ['getItem', 'setItem', 'removeItem']])(
  'auth when storage %s throws', (...failing) => {
    it('sends the token right after login', async () => {
      stubStorage(failing);
      const { api, auth } = await loadApi();
      auth.save('token-1');
      expect(auth.token()).toBe('token-1');
      const headers = stubFetch();
      await api.data();
      expect(headers).toEqual(['Bearer token-1']);
    });

    it('does not reuse the old token after logout', async () => {
      stubStorage(failing);
      const { api, auth } = await loadApi();
      auth.save('token-1');
      auth.clear();
      expect(auth.token()).toBeNull();
      const headers = stubFetch();
      await api.data();
      expect(headers).toEqual([undefined]);
    });

    it('does not reuse the old token after 401', async () => {
      stubStorage(failing);
      const { api, auth } = await loadApi();
      const onUnauthorized = vi.fn();
      auth.onUnauthorized(onUnauthorized);
      auth.save('token-1');
      const headers = stubFetch(json({ message: 'expired' }, 401));
      await expect(api.data()).rejects.toMatchObject({ status: 401 });
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
      expect(auth.token()).toBeNull();
      await api.data();
      expect(headers).toEqual(['Bearer token-1', undefined]);
    });
  });

describe('request errors', () => {
  it('keeps the HTTP status and server message', async () => {
    stubStorage();
    const { api, ApiError } = await loadApi();
    stubFetch(json({ detail: '서버 점검 중입니다' }, 503));
    const error = await api.data().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, message: '서버 점검 중입니다' });
  });
});
