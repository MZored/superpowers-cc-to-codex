function tryParseLine(line) {
  if (!line.trim().startsWith('{')) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function tryParseAssistantText(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function appendChunk(buffer, chunk) {
  return `${buffer}${typeof chunk === 'string' ? chunk : chunk?.toString?.('utf8') ?? ''}`;
}

function processLine(line, { onJsonEvent, onDiagnosticLine }) {
  if (!line.trim()) return;

  const event = tryParseLine(line);
  if (event) {
    onJsonEvent?.(event);
    return;
  }

  onDiagnosticLine?.(line);
}

export function createCodexJsonlStreamParser({ onJsonEvent, onDiagnosticLine } = {}) {
  let buffer = '';

  function push(chunk) {
    buffer = appendChunk(buffer, chunk);

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      processLine(line, { onJsonEvent, onDiagnosticLine });
    }
  }

  function end() {
    if (buffer) {
      processLine(buffer, { onJsonEvent, onDiagnosticLine });
      buffer = '';
    }
  }

  return { push, end };
}

export function advanceCodexLifecycle(previous, event) {
  if (!event || typeof event !== 'object') return previous;

  if (event.type === 'thread.started') {
    return {
      ...(previous ?? {}),
      stage: 'thread.started',
      threadId: event.thread_id ?? previous?.threadId ?? null,
      message: 'Codex thread created'
    };
  }

  if (event.type === 'turn.started') {
    return {
      ...(previous ?? {}),
      stage: 'turn.started',
      message: 'Codex turn started'
    };
  }

  if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
    const assistantText = event.item.text ?? previous?.assistantText ?? null;
    return {
      ...(previous ?? {}),
      stage: 'item.completed',
      assistantText,
      result: tryParseAssistantText(assistantText) ?? previous?.result ?? null,
      message: 'Codex assistant message completed'
    };
  }

  if (event.type === 'turn.completed') {
    return {
      ...(previous ?? {}),
      stage: 'turn.completed',
      message: 'Codex run completed'
    };
  }

  return previous;
}

export function parseCodexJsonl(jsonl) {
  let state = null;
  const parser = createCodexJsonlStreamParser({
    onJsonEvent: (event) => {
      state = advanceCodexLifecycle(state, event);
    }
  });

  parser.push(jsonl);
  parser.end();

  return {
    threadId: state?.threadId ?? null,
    assistantText: state?.assistantText ?? null,
    result: state?.result ?? null
  };
}

export function truncateRawOutput(text, maxChars = 12_000) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

export function validateImplementerResult(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('implementer-result must be a JSON object.');
  }

  for (const key of ['status', 'summary', 'files_changed', 'tests', 'concerns']) {
    if (!(key in result)) {
      throw new Error(`implementer-result missing required field "${key}".`);
    }
  }

  if (!Array.isArray(result.files_changed) || !Array.isArray(result.tests) || !Array.isArray(result.concerns)) {
    throw new Error('implementer-result arrays are malformed.');
  }

  if (!result.files_changed.every((f) => typeof f === 'string')) {
    throw new Error('implementer-result: files_changed must contain strings.');
  }
  if (!result.concerns.every((c) => typeof c === 'string')) {
    throw new Error('implementer-result: concerns must contain strings.');
  }

  return result;
}
