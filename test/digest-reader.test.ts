import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const night = '2024-02-29';
const event = { at: '2024-02-29T18:00:00Z', job: 'sync', owner: 'rook', status: 'ok' };

function tempRuns() {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('readNight', () => {
  it('reads the five jobs and tallies every valid event in the recorded night', () => {
    const digest = readNight('runs', '2026-10-28');
    expect(digest?.badLines).toBe(1);
    expect(digest?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest?.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0].owner).toBeNull();
    expect(digest?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, hasFailure: false,
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      lastStatus: 'ok', lastError: 'upstream 503',
    });
  });

  it('orders events by instant, breaks ties by log order and retains the original times', () => {
    const dir = tempRuns();
    const events = [
      { ...event, at: '2024-02-29T19:00:00.0002+01:00', status: 'retry', error: 'retry timed out' },
      { ...event, at: '2024-02-29T18:00:00.00020Z', owner: null },
      { ...event, at: '2024-02-29T20:00:00.0001+02:00', status: 'fail', error: 'first error' },
      { ...event, job: 'Zoo' },
      { ...event, job: '__proto__' },
    ];
    writeFileSync(join(dir, night + '.jsonl'), events.map(e => JSON.stringify(e)).join('\r\n'));
    const digest = readNight(dir, night);
    expect(digest?.rows.map(row => row.job)).toEqual(['Zoo', '__proto__', 'sync']);
    expect(digest?.rows[2]).toEqual({
      job: 'sync', owner: null, runs: 3, retries: 1, hasFailure: true,
      firstAt: events[2].at, lastAt: events[1].at, lastStatus: 'ok', lastError: 'retry timed out',
    });
  });

  it('counts each malformed nonblank line and continues after it', () => {
    const dir = tempRuns();
    const bad = [
      '{', 'null', '[]', '{}',
      ...[
        { at: 'invalid' }, { at: '2024-02-30T12:00:00Z' }, { status: 'constructor' },
        { owner: undefined }, { owner: 1 }, { error: null }, { job: 42 },
      ].map(fields => JSON.stringify({ ...event, ...fields })),
    ];
    writeFileSync(join(dir, night + '.jsonl'), [...bad, '   ', '', JSON.stringify(event)].join('\n'));
    expect(readNight(dir, night)).toMatchObject({
      badLines: bad.length, counts: { ok: 1, retry: 0, fail: 0 }, rows: [{ job: 'sync', runs: 1 }],
    });
  });

  it('distinguishes a blank or empty night from a missing or invalid date', () => {
    const dir = tempRuns();
    expect(readNight(dir, night)).toBeNull();
    for (const log of ['', ' \r\n\t']) {
      writeFileSync(join(dir, night + '.jsonl'), log);
      expect(readNight(dir, night)).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    }
    for (const invalid of ['2023-02-29', '2024-04-31', '2024-00-01', '24-02-29']) {
      writeFileSync(join(dir, invalid + '.jsonl'), '');
      expect(readNight(dir, invalid)).toBeNull();
    }
    const nested = join(dir, 'nested');
    mkdirSync(nested);
    expect(readNight(nested, '../' + night)).toBeNull();
  });

  it('propagates filesystem errors other than a missing file', () => {
    const dir = tempRuns();
    mkdirSync(join(dir, night + '.jsonl'));
    expect(() => readNight(dir, night)).toThrow();
  });
});
