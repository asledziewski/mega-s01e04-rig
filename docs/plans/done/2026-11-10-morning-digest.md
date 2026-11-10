---
plan: morning-digest
status: done
owner: rook
opened: 2026-10-29
closed: 2026-11-10
---

# Morning digest

The night's run log is a JSONL file nobody reads. By breakfast someone has to know what ran,
what retried, what failed, and whose it was, without opening `runs/`. rig already serves the
status board; the digest is one more page on it.

Out of scope: notifications, history across nights, auth (rig only listens on localhost).

## 1. Run log reader

Read `runs/<night>.jsonl` into one row per job: job, owner, runs, retries, last status, last
error, first and last time. One JSON object per line (`at`, `job`, `status`: `ok | retry | fail`,
`owner`, optional `error`).

- A line that doesn't parse is counted, never thrown. The night still renders.
- `owner` can be `null`. Keep the row; show the owner as `—`.
- Lives in `src/digest/`. Commit `src/digest/types.ts` first (the `DigestRow` type and the
  `readNight(runsDir, night)` signature), so every part of section 2 can start against it.

Done when: reader tests pass on `runs/2026-10-28.jsonl` (5 jobs, 1 bad line).

## 2. Digest page

Four small parts. Each needs only `src/digest/types.ts` from section 1, so once that is in they
can go to four workers at once. Small, well-specified work: a cheaper model is fine here.

### 2a. Page

`GET /digest/:night` renders the rows with the usual layout: one table, sorted by job, retries of
3 or more and any `fail` marked. A night with no file returns 404; an empty file renders
"nothing ran".

Done when: `/digest/2026-10-28` renders locally.

### 2b. JSON

`GET /api/digest/:night` returns the same rows as JSON. Agents read this one; the page and the
JSON must never disagree (ADR 0001).

Done when: the JSON for 2026-10-28 has the same jobs, in the same order, as the page.

### 2c. Board link

The status board links each night on disk to its digest, with its ok / retry / fail counts beside
it.

Done when: both nights on disk link to a digest that renders.

### 2d. Route tests

Route tests for 2a and 2b: 200, 404 for a night with no file, the empty night, a night with a bad
line. Use a temp runs dir; `runs/` is read-only.

Done when: `pnpm test` is green with the new tests.

## 3. Preview for review

The reviewer reads the page from a copy, not from the lane. Run rig and save `/digest/2026-10-28` as
one HTML file, lane banner included (a command, not a browser's "save as"; the page is
self-contained, ADR 0001). Put it on your own public host, one where you can upload over it later (any bucket
or static host, ADR 0003), so it opens from a public HTTPS link. Send the reviewer the link and the
issues for this plan.

Done when: the reviewer has seen the marked preview (course review confirmation received).

## 4. Clean up

The preview carries this lane's marker on a public link (ADR 0003). Take the marker off: save the
page again with `LANE_MARKER` unset (the banner reads "no marker set") and upload it over the same
link. Move this plan to `docs/plans/done/` with its issue list.

Done when: the preview link no longer shows the lane marker.

## Issues

| Issue | Plan section | Worker | Completed |
| --- | --- | --- | --- |
| [#1 Define the shared digest contract](https://github.com/asledziewski/mega-s01e04-rig/issues/1) | 1 | Codex · gpt-6-astra · high | 2026-11-10 23:26 +01:00 |
| [#2 Read and aggregate nightly run logs](https://github.com/asledziewski/mega-s01e04-rig/issues/2) | 1 | Codex · gpt-6-astra · high | 2026-11-10 23:32 +01:00 |
| [#3 Render the nightly digest HTML page](https://github.com/asledziewski/mega-s01e04-rig/issues/3) | 2a | Codex · gpt-6-luna · high | 2026-11-10 23:32 +01:00 |
| [#4 Serve the nightly digest JSON endpoint](https://github.com/asledziewski/mega-s01e04-rig/issues/4) | 2b | Codex · gpt-6-luna · medium | 2026-11-10 23:32 +01:00 |
| [#5 Link nightly digests from the status board](https://github.com/asledziewski/mega-s01e04-rig/issues/5) | 2c | Codex · gpt-6-luna · high | 2026-11-10 23:32 +01:00 |
| [#6 Test the digest HTML and JSON routes](https://github.com/asledziewski/mega-s01e04-rig/issues/6) | 2d | Codex · gpt-6-luna · high | 2026-11-10 23:32 +01:00 |
| [#7 Publish the digest HTML preview for review](https://github.com/asledziewski/mega-s01e04-rig/issues/7) | 3 | Codex · session model/effort not exposed | 2026-11-10 23:47 +01:00 |
| [#8 Remove the public preview marker and archive the plan](https://github.com/asledziewski/mega-s01e04-rig/issues/8) | 4 | Codex · session model/effort not exposed | 2026-11-10; closure follows this archive commit |

## Review and cleanup

The course confirmed the reviewer had seen the marked preview before cleanup began. The human separately approved publishing the preview and replacing it without its marker. The original section 3 completion check (link sent) was tightened to require the reviewer to have seen it before the review issue could close.

The same public URL, https://mega-s01e04-rig-b29.pages.dev/, now serves the sample digest with the banner reading no marker set. A command-generated HTML copy was uploaded by the human; .env, HTML previews, ZIP files and course proofs remain outside git. Public HTML was verified byte-for-byte against the clean local export.

Validation: 10 tests across 3 files passed; TypeScript typechecking passed. Both sample nights linked from the board and returned HTTP 200. Source logs in runs/ were unchanged.
