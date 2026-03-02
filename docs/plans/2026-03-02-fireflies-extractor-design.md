# Fireflies.ai Meetings Extractor — Design

## Overview

Local CLI tool that pulls a user's entire Fireflies.ai meeting catalog to their local filesystem. Non-technical users provide an API key and run it.

## Tech Stack

- TypeScript, Node.js LTS (native fetch)
- `tsx` for running TypeScript directly (no build step)
- `pnpm` package manager
- `@inquirer/prompts` for interactive API key input

## Code Structure (Approach A: Flat Modules)

```
src/
  index.ts          # Entry point — CLI arg parsing, orchestration loop
  api.ts            # Fireflies GraphQL client (list + fetch transcript)
  writer.ts         # Writes meeting files to disk (JSON, txt, media)
  manifest.ts       # .manifest.json read/write/check
  types.ts          # TypeScript interfaces for API responses
  utils.ts          # Sanitize title, format timestamp, sleep, arg parsing
```

## Module Responsibilities

### `src/index.ts` — Entry point & orchestration

- Parse CLI args (manual parsing — no library needed for 4 flags)
- Resolve API key: `--api-key` > `FIREFLIES_API_KEY` env var > interactive prompt
- Orchestration loop: list all transcripts → filter via manifest → fetch each → write to disk
- Progress logging: `[12/47] Processing: "Sprint Review" (2026-03-01)...`
- Final summary: new/skipped/failed counts

### `src/api.ts` — Fireflies GraphQL client

- `listAllTranscripts(apiKey)` — paginates with limit=50, skip+=50 until empty
- `fetchTranscript(apiKey, id)` — fetches full transcript by ID
- `downloadMedia(url, destPath)` — streams media to disk via native fetch
- Check `errors` array in every GraphQL response, throw if present

### `src/writer.ts` — File system output

- `writeMeeting(outputDir, transcript)` — creates folder, writes:
  - `metadata.json` — id, title, date, duration, participants, speakers, host/organizer, meeting_link
  - `transcript.json` — raw sentences array
  - `summary.json` — keywords, action_items, outline, topics, chapters
  - `analytics.json` — sentiments + per-speaker analytics
  - `transcript.txt` — human-readable `[MM:SS] Speaker: text` format
- `buildFolderName(transcript)` — `{YYYY-MM-DD}_{sanitized-title}_{id}`
- `buildYearMonth(dateMs)` — `YYYY-MM` from millisecond timestamp

### `src/manifest.ts` — Idempotency tracking

- `readManifest(outputDir)` — reads `.manifest.json`, returns empty manifest if missing
- `isProcessed(manifest, meetingId)` — checks if already done
- `markProcessed(manifest, meetingId, date, folder)` — adds entry
- `writeManifest(outputDir, manifest)` — writes to disk after each meeting

### `src/types.ts` — TypeScript interfaces

- `TranscriptListItem` — `{ id, title, date, duration }`
- `Transcript` — full response matching GraphQL query shape
- `Manifest` — `{ version, lastUpdated, meetings: Record<string, ...> }`
- Sub-types: `Sentence`, `Speaker`, `MeetingAttendee`, `Summary`, `Analytics`

### `src/utils.ts` — Small helpers

- `sanitizeTitle(title)` — non-alphanumeric → hyphens, collapse, limit 60 chars
- `formatTimestamp(seconds, longFormat)` — `[MM:SS]` or `[HH:MM:SS]`
- `sleep(ms)` — delay wrapper for rate limiting
- `parseArgs(argv)` — manual CLI arg parser returning typed options

## Orchestration Flow

1. Parse args, resolve API key
2. Ensure output directory exists
3. Read manifest
4. List ALL transcripts (paginate until empty)
5. For each transcript:
   - Skip if manifest says "processed" (unless `--force`)
   - Log progress: `[n/total] Processing: "title" (date)...`
   - Fetch full transcript
   - Sleep 1.2s (rate limit)
   - Write all files to disk
   - If `--include-media`: download audio/video (with sleep between)
   - Update manifest, write to disk
   - On error: log, increment failed count, continue
6. Print summary

## CLI Interface

```
Usage: fireflies-pull [options]

Options:
  --api-key <key>     Fireflies API key (or set FIREFLIES_API_KEY env var)
  --output <dir>      Output directory (default: ./fireflies-meetings)
  --force             Reprocess all meetings, ignoring manifest
  --include-media     Also download audio/video files (skipped by default)
  --help              Show help
```

## Output Directory Structure

```
fireflies-meetings/
├── .manifest.json
├── 2026-03/
│   ├── 2026-03-01_Project-Standup_abc123/
│   │   ├── metadata.json
│   │   ├── transcript.json
│   │   ├── summary.json
│   │   ├── analytics.json
│   │   ├── transcript.txt
│   │   ├── audio.{ext}       # only with --include-media
│   │   └── video.{ext}       # only with --include-media
│   └── ...
└── 2026-02/
    └── ...
```

## Error Handling

- Per-meeting try/catch — one failure doesn't halt the run
- GraphQL `errors` array checked on every response
- Media download failures logged but non-fatal (data files already written)
- Summary reports failures: `Done! 35 new, 12 skipped, 2 failed.`

## Rate Limiting

- 60 requests/minute limit
- 1.2s delay between individual transcript fetches
- Listing pages don't need delay (few relative to individual fetches)

## Idempotency

- `.manifest.json` tracks processed meeting IDs
- Written after each meeting (survives interrupted runs)
- `--force` flag to reprocess all regardless of manifest
