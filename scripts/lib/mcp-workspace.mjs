import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function normalizeRoot(input) {
  if (!input) return null;
  if (input.startsWith('file://')) {
    return resolve(fileURLToPath(input));
  }
  if (isAbsolute(input)) {
    return resolve(input);
  }
  throw new Error(
    `workspaceRoot must be an absolute path or a file:// URI (e.g. "/Users/you/repo" or "file:///Users/you/repo"), got: "${input}".`
  );
}

export function assertInsideRoot(rootPath, candidatePath) {
  const rel = relative(rootPath, candidatePath);
  const firstComponent = rel.split('/')[0];
  if (firstComponent === '..' || isAbsolute(rel)) {
    throw new Error(`Resolved path "${candidatePath}" is outside workspace root "${rootPath}".`);
  }
}

export function selectWorkspaceRoot({ workspaceRoot, roots = [] }) {
  const normalizedRoots = roots.map((root) => normalizeRoot(root.uri));
  const requested = normalizeRoot(workspaceRoot);

  if (normalizedRoots.length === 0) {
    if (!requested) {
      throw new Error('workspaceRoot is required when the client does not advertise roots.');
    }
    return requested;
  }

  if (normalizedRoots.length === 1 && !requested) {
    return normalizedRoots[0];
  }

  if (!requested) {
    throw new Error('workspaceRoot is required when the client advertises multiple roots.');
  }

  if (!normalizedRoots.includes(requested)) {
    throw new Error(`workspaceRoot "${requested}" does not match any advertised client root.`);
  }

  return requested;
}
