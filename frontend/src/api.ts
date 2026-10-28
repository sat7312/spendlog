export type Category = { id: string; name: string; icon: string };
export type ExpenseRecord = { id: string; category: string; name: string; amount: number; date: string };
export type SpendlogData = { categories: Category[]; records: ExpenseRecord[] };
export type RecordInput = Omit<ExpenseRecord, 'id'>;
export type User = { email: string; name: string };

const base = import.meta.env.VITE_API_BASE_URL ?? '';
const tokenKey = 'spendlog_token';
let unauthorized = () => {};

/** HTTP 상태를 함께 담는 API 오류입니다. 메시지는 화면에 그대로 보여 줍니다. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// 저장소를 쓸 수 없을 때를 대비해 이번 탭의 토큰을 메모리에도 둡니다.
// persisted가 true이면 저장소가 현재 상태를 반영하므로 저장소 값을 읽어 다른 탭의 변경도 따릅니다.
let memoryToken: string | null = null;
let persisted = true;

export const auth = {
  token: () => {
    if (persisted) {
      try { return localStorage.getItem(tokenKey); } catch { /* 저장소를 읽지 못하면 메모리 값을 씁니다. */ }
    }
    return memoryToken;
  },
  save: (token: string) => {
    memoryToken = token;
    try { localStorage.setItem(tokenKey, token); persisted = true; } catch { persisted = false; }
  },
  // 저장소에서 지우지 못해도 남은 토큰을 이번 탭에서 다시 쓰지 않습니다.
  clear: () => {
    memoryToken = null;
    try { localStorage.removeItem(tokenKey); persisted = true; } catch { persisted = false; }
  },
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
    throw new ApiError('로그인이 만료되었습니다. 다시 로그인해 주세요', response.status);
  }
  if (!response.ok) {
    let message = `요청에 실패했습니다 (${response.status})`;
    try {
      const error = await response.json();
      message = error.detail ?? error.message ?? message;
    } catch { /* 응답 본문이 JSON이 아닐 수 있습니다. */ }
    throw new ApiError(message, response.status);
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
