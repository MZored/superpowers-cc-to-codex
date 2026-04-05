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

export function parseCodexJsonl(jsonl) {
  let threadId = null;
  let assistantText = null;
  let result = null;

  for (const line of jsonl.split('\n')) {
    const event = tryParseLine(line);
    if (!event) continue;

    if (event.type === 'thread.started' && event.thread_id) {
      threadId = event.thread_id;
    }

    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      assistantText = event.item.text ?? assistantText;
      result = tryParseAssistantText(event.item.text) ?? result;
    }
  }

  return { threadId, assistantText, result };
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

  return result;
}
