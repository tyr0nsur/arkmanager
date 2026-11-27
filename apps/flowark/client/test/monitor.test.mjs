import test from 'node:test';
import assert from 'node:assert/strict';
import { monitorStatus, bytesLabel, uptimeLabel } from '../src/features/monitor/format.js';

test('monitor readings expire without a new browser event and unknown values stay unavailable', () => {
  const now = 100000;
  assert.equal(monitorStatus({ status: 'connected', lastSeenAt: now }, now), 'connected');
  assert.equal(monitorStatus({ status: 'connected', lastSeenAt: now }, now + 6501), 'stale');
  assert.equal(monitorStatus({ status: 'connected', lastSeenAt: now + 1001 }, now), 'stale');
  assert.equal(monitorStatus({ status: 'connected' }, now), 'stale');
  assert.equal(monitorStatus({ status: 'unavailable' }, now), 'unavailable');
  for (const value of [undefined, null, NaN, -1]) { assert.equal(bytesLabel(value), '—'); assert.equal(uptimeLabel(value), '—'); }
  assert.equal(bytesLabel(0), '0 MiB');
  assert.equal(bytesLabel(2 * 1073741824), '2.00 GiB');
  assert.equal(uptimeLabel(3660), '1 h 1 min');
  assert.equal(uptimeLabel(90000), '1 d 1 h');
});
