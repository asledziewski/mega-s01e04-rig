import type { DigestRow, NightDigest } from '../digest/types.js';

function missing(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '—' : value;
}

function DigestRowView({ row }: { row: DigestRow }) {
  const highlighted = row.retries >= 3 || row.hasFailure;
  const status = row.hasFailure
    ? `${row.lastStatus} · failure seen`
    : row.lastStatus;

  return (
    <tr class={highlighted ? 'warn' : undefined}>
      <td>{row.job}</td>
      <td>{missing(row.owner)}</td>
      <td>{row.runs}</td>
      <td>{row.retries >= 3 ? <strong>{row.retries}</strong> : row.retries}</td>
      <td>{status}</td>
      <td>{missing(row.lastError)}</td>
      <td>{missing(row.firstAt)}</td>
      <td>{missing(row.lastAt)}</td>
    </tr>
  );
}

export function DigestPage({ night, digest }: { night: string; digest: NightDigest }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p class="digest-meta">
        {digest.rows.length} {digest.rows.length === 1 ? 'job' : 'jobs'} · {digest.badLines} bad {digest.badLines === 1 ? 'line' : 'lines'}
      </p>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <div class="digest-table-wrap">
          <table aria-label={`Run digest for ${night}`}>
            <thead>
              <tr>
                <th scope="col">job</th>
                <th scope="col">owner</th>
                <th scope="col">runs</th>
                <th scope="col">retries</th>
                <th scope="col">last status</th>
                <th scope="col">last error</th>
                <th scope="col">first at</th>
                <th scope="col">last at</th>
              </tr>
            </thead>
            <tbody>
              {digest.rows.map((row) => <DigestRowView row={row} />)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
