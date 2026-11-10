export type Category = { id: string; name: string; icon: string };
export type ExpenseRecord = { id: string; category: string; name: string; amount: number; date: string };
export type SpendlogData = { categories: Category[]; records: ExpenseRecord[] };
export type RecordInput = Omit<ExpenseRecord, 'id'>;

/** HTTP 상태를 함께 담는 API 오류입니다. 메시지는 화면에 그대로 보여 줍니다. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
