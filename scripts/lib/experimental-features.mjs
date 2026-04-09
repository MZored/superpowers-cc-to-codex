export function loadExperimentalFeatures(env = process.env) {
  return {
    taskMode:
      env?.SUPERPOWERS_CODEX_EXPERIMENTAL_TASKS === 'implement-resume' ? 'implement-resume' : 'off'
  };
}
