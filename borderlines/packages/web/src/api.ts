import type { AnswerResult, Meta, Round, Summary } from './types.ts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export const api = {
  meta: () => request<Meta>('/api/meta'),

  createRound: (options: {
    categories?: string[];
    difficulty?: string;
    length?: number;
    seed?: string;
  }) =>
    request<Round>('/api/rounds', { method: 'POST', body: JSON.stringify(options) }),

  answer: (roundId: string, questionId: string, choiceId: string, elapsedMs: number) =>
    request<AnswerResult>(`/api/rounds/${roundId}/answers`, {
      method: 'POST',
      body: JSON.stringify({ questionId, choiceId, elapsedMs }),
    }),

  summary: (roundId: string) => request<Summary>(`/api/rounds/${roundId}/summary`),

  explain: (roundId: string, questionId: string) =>
    request<{ text: string; model: string }>(
      `/api/rounds/${roundId}/questions/${questionId}/explain`,
      { method: 'POST' },
    ),
};
