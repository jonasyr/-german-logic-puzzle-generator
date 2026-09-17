export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'Es werden JSON-Daten erwartet.');
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Die Anfrage enthält kein gültiges JSON.');
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status);
  }
  console.error(error);
  return json({ error: 'Die Anfrage konnte nicht verarbeitet werden.' }, 500);
}
