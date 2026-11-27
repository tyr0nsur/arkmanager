/* eslint-disable no-control-regex -- Intentionally remove terminal control bytes from untrusted logs. */
// Remote logs and player names are plain text, never terminal instructions.
export function consoleText(value) {
  return String(value ?? '')
    .replace(/(?:\x1b\]|\x9d)[\s\S]*?(?:\x07|\x1b\\|\x9c|$)/g, '')
    .replace(/\x1b[P^_][\s\S]*?(?:\x1b\\|\x9c|$)/g, '')
    .replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[^\r\n]?/g, '')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
}

export function consoleEntriesForMap(entries, mapId) {
  return entries.filter(entry => entry.mapId === mapId);
}
