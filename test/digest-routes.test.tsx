import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const temporaryDirectories: string[] = [];

function makeRunsDir() {
  const root = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  temporaryDirectories.push(root);
  const runsDir = join(root, 'runs');
  mkdirSync(runsDir);
  const config = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
  return { root, runsDir, app: createApp(config) };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('digest routes', () => {
  it('serves the same sorted digest as JSON and an escaped, complete HTML table', async () => {
    const { runsDir, app } = makeRunsDir();
    const night = '2026-10-29';
    const log = [
      JSON.stringify({ at: '2026-10-29T08:01:00+02:00', job: 'retry-job', owner: 'ops', status: 'retry' }),
      JSON.stringify({ at: '2026-10-29T08:02:00+02:00', job: 'recovered-job', owner: null, status: 'fail', error: '<script>alert("x")</script>' }),
      'this is not json',
      JSON.stringify({ at: '2026-10-29T06:03:00Z', job: 'retry-job', owner: 'ops', status: 'retry' }),
      JSON.stringify({ at: '2026-10-29T06:04:00Z', job: 'recovered-job', owner: null, status: 'ok' }),
      JSON.stringify({ at: '2026-10-29T08:05:00+02:00', job: 'retry-job', owner: 'ops', status: 'retry' }),
      JSON.stringify({ at: '2026-10-29T06:06:00Z', job: 'retry-job', owner: 'ops', status: 'ok' }),
      JSON.stringify({ at: '2026-10-29T06:07:00Z', job: '<img src=x onerror=alert(1)>', owner: 'team & <admin>', status: 'ok', error: 'bad & <unsafe>' }),
    ].join('\n');
    writeFileSync(join(runsDir, `${night}.jsonl`), log);

    const [jsonResponse, htmlResponse] = await Promise.all([
      app.request(`/api/digest/${night}`),
      app.request(`/digest/${night}`),
    ]);
    const digest: unknown = await jsonResponse.json();
    const html = await htmlResponse.text();

    expect(jsonResponse.status).toBe(200);
    expect(htmlResponse.status).toBe(200);
    expect(digest).toEqual({
      rows: [
        {
          job: '<img src=x onerror=alert(1)>', owner: 'team & <admin>', runs: 1, retries: 0,
          hasFailure: false, lastStatus: 'ok', lastError: 'bad & <unsafe>',
          firstAt: '2026-10-29T06:07:00Z', lastAt: '2026-10-29T06:07:00Z',
        },
        {
          job: 'recovered-job', owner: null, runs: 2, retries: 0, hasFailure: true,
          lastStatus: 'ok', lastError: '<script>alert("x")</script>',
          firstAt: '2026-10-29T08:02:00+02:00', lastAt: '2026-10-29T06:04:00Z',
        },
        {
          job: 'retry-job', owner: 'ops', runs: 4, retries: 3, hasFailure: false,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T08:01:00+02:00', lastAt: '2026-10-29T06:06:00Z',
        },
      ],
      badLines: 1,
      counts: { ok: 3, retry: 3, fail: 1 },
    });

    const jobs = ['&lt;img src=x onerror=alert(1)&gt;', 'recovered-job', 'retry-job'];
    expect(jobs.map((job) => html.indexOf(job))).toEqual([...jobs.map((job) => html.indexOf(job))].sort((a, b) => a - b));
    expect(html).toContain('bad line');
    expect(html).toContain('failure seen');
    expect(html).toContain('<strong>3</strong>');
    expect(html.match(/<tr class="warn">[\s\S]*?<\/tr>/g) ?? []).toHaveLength(2);
    expect(html).toContain('—');
    expect(html).toContain('2026-10-29T08:02:00+02:00');
    expect(html).toContain('2026-10-29T06:04:00Z');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('team &amp; &lt;admin&gt;');
    expect(html).toContain('bad &amp; &lt;unsafe&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x onerror=');
  });

  it('renders an empty file and returns 404 for a missing night in both formats', async () => {
    const { runsDir, app } = makeRunsDir();
    const emptyNight = '2026-10-30';
    writeFileSync(join(runsDir, `${emptyNight}.jsonl`), '');

    const [emptyHtml, emptyJson, missingHtml, missingJson] = await Promise.all([
      app.request(`/digest/${emptyNight}`),
      app.request(`/api/digest/${emptyNight}`),
      app.request('/digest/2026-10-31'),
      app.request('/api/digest/2026-10-31'),
    ]);

    expect(emptyHtml.status).toBe(200);
    expect(await emptyHtml.text()).toContain('nothing ran');
    expect(emptyJson.status).toBe(200);
    expect(await emptyJson.json()).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    expect(missingHtml.status).toBe(404);
    expect(missingJson.status).toBe(404);
  });

  it('rejects traversal-shaped nights without reading a neighboring file', async () => {
    const { root, app } = makeRunsDir();
    writeFileSync(join(root, 'outside.jsonl'), JSON.stringify({
      at: '2026-10-29T06:00:00Z', job: 'outside', owner: 'secret', status: 'ok',
    }));
    const traversalNight = encodeURIComponent('../outside');

    const [html, json] = await Promise.all([
      app.request(`/digest/${traversalNight}`),
      app.request(`/api/digest/${traversalNight}`),
    ]);

    expect(html.status).toBe(404);
    expect(json.status).toBe(404);
  });
});
