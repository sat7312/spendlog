export type Category = { id: string; name: string; icon: string };
export type ExpenseRecord = { id: string; category: string; name: string; amount: number; date: string };
export type SpendlogData = { categories: Category[]; records: ExpenseRecord[] };
export type RecordInput = Omit<ExpenseRecord, 'id'>;

const base = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
  data: () => request<SpendlogData>('/data'),
  addCategory: (name: string, icon: string) => request<Category>('/categories', 'POST', { name, icon }),
  deleteCategory: (id: string) => request<void>(`/categories/${encodeURIComponent(id)}`, 'DELETE'),
  addRecord: (input: RecordInput) => request<ExpenseRecord>('/records', 'POST', input),
  updateRecord: (id: string, input: RecordInput) => request<ExpenseRecord>(`/records/${encodeURIComponent(id)}`, 'PUT', input),
  deleteRecord: (id: string) => request<void>(`/records/${encodeURIComponent(id)}`, 'DELETE'),
  restore: (data: SpendlogData) => request<SpendlogData>('/data', 'PUT', data),
};
