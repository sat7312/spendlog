export type Category = { id: string; name: string; icon: string };
export type ExpenseRecord = { id: string; category: string; name: string; amount: number; date: string };
export type SpendlogData = { categories: Category[]; records: ExpenseRecord[] };
export type RecordInput = Omit<ExpenseRecord, 'id'>;
export type User = { email: string; name: string };

const base = import.meta.env.VITE_API_BASE_URL ?? '';
const tokenKey = 'spendlog_token';
let unauthorized = () => {};

export const auth = {
  token: () => { try { return localStorage.getItem(tokenKey); } catch { return null; } },
  save: (token: string) => { try { localStorage.setItem(tokenKey, token); } catch { /* 저장소를 못 써도 이번 탭에서는 동작합니다. */ } },
  clear: () => { try { localStorage.removeItem(tokenKey); } catch { /* 무시합니다. */ } },
  onUnauthorized: (callback: () => void) => { unauthorized = callback; },
};

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 && !path.startsWith('/auth/')) {
    auth.clear();
    unauthorized();
    throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요');
  }
  if (!response.ok) {
    let message = `요청에 실패했습니다 (${response.status})`;
    try {
      const error = await response.json();
      message = error.detail ?? error.message ?? message;
    } catch { /* 응답 본문이 JSON이 아닐 수 있습니다. */ }
    throw new Error(message);
  }
  if (response.status === 204 || method === 'DELETE') return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  login: (credential: string) => request<{ token: string; user: User }>('/auth/google', 'POST', { credential }),
  me: () => request<User>('/me'),
  data: () => request<SpendlogData>('/data'),
  addCategory: (name: string, icon: string) => request<Category>('/categories', 'POST', { name, icon }),
  updateCategory: (id: string, name: string, icon: string) =>
    request<Category>(`/categories/${encodeURIComponent(id)}`, 'PUT', { name, icon }),
  deleteCategory: (id: string) => request<void>(`/categories/${encodeURIComponent(id)}`, 'DELETE'),
  addRecord: (input: RecordInput) => request<ExpenseRecord>('/records', 'POST', input),
  updateRecord: (id: string, input: RecordInput) => request<ExpenseRecord>(`/records/${encodeURIComponent(id)}`, 'PUT', input),
  deleteRecord: (id: string) => request<void>(`/records/${encodeURIComponent(id)}`, 'DELETE'),
  restore: (data: SpendlogData) => request<SpendlogData>('/data', 'PUT', data),
};
