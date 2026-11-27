import test from 'node:test';
import assert from 'node:assert/strict';
import { consoleText, consoleEntriesForMap } from '../src/utils/consoleText.js';

test('server output cannot set clipboard, title, colors or erase the terminal', () => {
  assert.equal(consoleText('ok\x1b]52;c;c2VjcmV0\x07\x1b]0;title\x1b\\\x1b[2J\x1b[31m rojo\x1b[0m'), 'ok rojo');
  assert.equal(consoleText('log\x1bPpayload\x1b\\\x9b2J\x00\x08\x7f\x9d0;title\x9c fin'), 'log fin');
  assert.equal(consoleText('antes\x1b]52;unfinished'), 'antes');
});
test('console keeps Unicode, tabs and line boundaries', () => {
  assert.equal(consoleText('España 🦖\r\n\tjugador\rfin'), 'España 🦖\n\tjugador\nfin');
});
test('late command responses remain attached to their original map', () => {
  const entries = [{ mapId: 'island', text: 'request' }, { mapId: 'center', text: 'other' }, { mapId: 'island', text: 'late response' }, { text: 'legacy unknown target' }];
  assert.deepEqual(consoleEntriesForMap(entries, 'island').map(entry => entry.text), ['request', 'late response']);
  assert.deepEqual(consoleEntriesForMap(entries, 'unknown'), []);
});
