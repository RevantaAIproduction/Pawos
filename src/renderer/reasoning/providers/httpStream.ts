/** Shared streaming-response parsing helpers for HTTP-based reasoning providers. */

export async function parseSseStream(
  response: Response,
  onEvent: (data: string) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response has no readable body.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal.aborted) {
      await reader.cancel().catch(() => {});
      return;
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data) onEvent(data);
    }
  }
}

export async function parseNdjsonStream(
  response: Response,
  onEvent: (data: string) => void,
  signal: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response has no readable body.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal.aborted) {
      await reader.cancel().catch(() => {});
      return;
    }

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) onEvent(trimmed);
    }
  }
}

export async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return response.statusText;
  }
}
