import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** fetch 응답을 순서대로 돌려주고, 각 요청의 주소와 옵션을 기록합니다. */
function stubFetch(...responses: Response[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return responses.shift() ?? json({ categories: [], records: [] });
  }));
  return calls;
}

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('requests to the local backend', () => {
  it('uses the relative /api path without an Authorization header', async () => {
    const calls = stubFetch();
    await api.data();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/data');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('works without touching localStorage', async () => {
    const blocked = () => { throw new DOMException('storage blocked', 'SecurityError'); };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    stubFetch(json({ categories: [], records: [] }));
    await expect(api.data()).resolves.toEqual({ categories: [], records: [] });
  });

  it('sends JSON bodies and returns the parsed response', async () => {
    const calls = stubFetch(json({ id: 'c1', name: '여행', icon: 'ti-plane' }));
    await expect(api.addCategory('여행', 'ti-plane')).resolves.toEqual({ id: 'c1', name: '여행', icon: 'ti-plane' });
    expect(calls[0].url).toBe('/api/categories');
    expect(calls[0].init?.method).toBe('POST');
    expect((calls[0].init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(calls[0].init?.body).toBe(JSON.stringify({ name: '여행', icon: 'ti-plane' }));
  });

  it('resolves DELETE requests without reading a body', async () => {
    const calls = stubFetch(new Response(null, { status: 200 }));
    await expect(api.deleteRecord('a/b')).resolves.toBeUndefined();
    expect(calls[0].url).toBe('/api/records/a%2Fb');
    expect(calls[0].init?.method).toBe('DELETE');
  });
});

describe('request errors', () => {
  it('keeps the HTTP status and server message', async () => {
    stubFetch(json({ detail: '서버 점검 중입니다' }, 503));
    const error = await api.data().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, message: '서버 점검 중입니다' });
  });

  it('treats 401 like any other error', async () => {
    stubFetch(json({ message: '거부되었습니다' }, 401));
    await expect(api.data()).rejects.toMatchObject({ status: 401, message: '거부되었습니다' });
  });

  it('falls back to a generic message when the body is not JSON', async () => {
    stubFetch(new Response('oops', { status: 500 }));
    await expect(api.data()).rejects.toMatchObject({ status: 500, message: '요청에 실패했습니다 (500)' });
  });

  it('passes network failures through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(api.data()).rejects.toThrow('Failed to fetch');
  });
});
