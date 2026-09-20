import {
  BOOKLET_LIMITS,
  STANDARD_THEME_ID,
  generateGermanLogicBooklet,
  listGermanThemes,
} from 'logic-puzzle-generator';

type WorkerRequest =
  | { id: number; type: 'options' }
  | { id: number; type: 'generate'; options: Record<string, unknown> };

type WorkerResponse =
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: string };

function post(response: WorkerResponse): void {
  self.postMessage(response);
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'options') {
      post({
        id: request.id,
        ok: true,
        data: {
          themes: [
            { id: STANDARD_THEME_ID, title: 'Alle Themen abwechselnd' },
            ...listGermanThemes(),
          ],
          limits: BOOKLET_LIMITS,
        },
      });
      return;
    }

    const startedAt = performance.now();
    const booklet = generateGermanLogicBooklet({
      generatedAt: new Date().toISOString().slice(0, 10),
      ...request.options,
    });
    post({
      id: request.id,
      ok: true,
      data: { booklet, durationMs: Math.round(performance.now() - startedAt) },
    });
  } catch (error) {
    post({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Erzeugung fehlgeschlagen.',
    });
  }
});
