# Fireflies.ai Meetings Extractor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI tool that downloads all Fireflies.ai meetings to the local filesystem, organized by year-month, with idempotency via a manifest file.

**Architecture:** Six flat TypeScript modules — types, utils, manifest, API client, file writer, and orchestrator entry point. No classes, just exported functions. Native fetch for HTTP, `@inquirer/prompts` for interactive input.

**Tech Stack:** TypeScript, Node.js LTS, tsx, pnpm, @inquirer/prompts

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts` (placeholder)

**Step 1: Initialize project with pnpm**

```bash
cd /Users/dzhuneytahmed/projects/protokol/fireflies.ai-meetings-extractor-local
pnpm init
```

**Step 2: Install dependencies**

```bash
pnpm add @inquirer/prompts
pnpm add -D typescript tsx @types/node
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

**Step 4: Update package.json**

Add these fields to `package.json`:

```json
{
  "type": "module",
  "bin": {
    "fireflies-pull": "./src/index.ts"
  }
}
```

**Step 5: Create placeholder entry point**

Create `src/index.ts`:

```typescript
#!/usr/bin/env npx tsx
console.log("fireflies-pull: not yet implemented");
```

**Step 6: Verify it runs**

```bash
npx tsx src/index.ts
```

Expected: prints `fireflies-pull: not yet implemented`

**Step 7: Commit**

```bash
git init
git add package.json pnpm-lock.yaml tsconfig.json src/index.ts docs/
git commit -m "chore: scaffold project with pnpm, typescript, tsx"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `src/types.ts`

**Step 1: Write all type definitions**

Create `src/types.ts` with these interfaces matching the Fireflies GraphQL API:

```typescript
// --- Fireflies API response types ---

export interface TranscriptListItem {
  id: string;
  title: string;
  date: number;       // Unix timestamp in milliseconds
  duration: number;    // seconds
}

export interface Sentence {
  speaker_name: string;
  speaker_id: string;
  text: string;
  raw_text: string;
  start_time: number;  // seconds
  end_time: number;    // seconds
}

export interface Speaker {
  id: string;
  name: string;
}

export interface MeetingAttendee {
  displayName: string;
  email: string;
  phoneNumber: string;
}

export interface SummaryData {
  keywords: string[] | null;
  action_items: string[] | null;
  outline: string[] | null;
  topics_discussed: string[] | null;
  transcript_chapters: string[] | null;
}

export interface Sentiment {
  negative: number;
  neutral: number;
  positive: number;
}

export interface SpeakerAnalytics {
  name: string;
  duration: number;
  word_count: number;
  filler_words: number;
  questions: number;
  words_per_minute: number;
}

export interface Analytics {
  sentiments: Sentiment | null;
  speakers: SpeakerAnalytics[] | null;
}

export interface Transcript {
  id: string;
  title: string;
  date: number;          // Unix timestamp in milliseconds
  dateString: string;
  duration: number;
  audio_url: string | null;
  video_url: string | null;
  transcript_url: string | null;
  host_email: string | null;
  organizer_email: string | null;
  meeting_link: string | null;
  participants: string[];
  meeting_attendees: MeetingAttendee[];
  speakers: Speaker[];
  sentences: Sentence[];
  summary: SummaryData | null;
  analytics: Analytics | null;
}

// --- Manifest types ---

export interface ManifestEntry {
  status: "processed";
  date: string;    // ISO 8601
  folder: string;  // relative path from output root, e.g. "2026-03/2026-03-01_Standup_abc123"
}

export interface Manifest {
  version: 1;
  lastUpdated: string;  // ISO 8601
  meetings: Record<string, ManifestEntry>;
}

// --- CLI types ---

export interface CliOptions {
  apiKey: string | undefined;
  output: string;
  force: boolean;
  includeMedia: boolean;
  help: boolean;
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add TypeScript type definitions for API responses and manifest"
```

---

### Task 3: Utility Functions

**Files:**
- Create: `src/utils.ts`

**Step 1: Implement all utility functions**

Create `src/utils.ts`:

```typescript
import { CliOptions } from "./types.js";

export function sanitizeTitle(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function formatTimestamp(seconds: number, longFormat: boolean): string {
  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");

  if (longFormat) {
    const hh = String(h).padStart(2, "0");
    return `[${hh}:${mm}:${ss}]`;
  }
  return `[${mm}:${ss}]`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2); // skip node and script path
  const options: CliOptions = {
    apiKey: undefined,
    output: "./fireflies-meetings",
    force: false,
    includeMedia: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--api-key":
        options.apiKey = args[++i];
        break;
      case "--output":
        options.output = args[++i];
        break;
      case "--force":
        options.force = true;
        break;
      case "--include-media":
        options.includeMedia = true;
        break;
      case "--help":
        options.help = true;
        break;
    }
  }

  return options;
}

export function printHelp(): void {
  console.log(`
Usage: fireflies-pull [options]

Options:
  --api-key <key>     Fireflies API key (or set FIREFLIES_API_KEY env var)
  --output <dir>      Output directory (default: ./fireflies-meetings)
  --force             Reprocess all meetings, ignoring manifest
  --include-media     Also download audio/video files (skipped by default)
  --help              Show help
`.trim());
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/utils.ts
git commit -m "feat: add utility functions (sanitize, timestamps, arg parser)"
```

---

### Task 4: Manifest Module

**Files:**
- Create: `src/manifest.ts`

**Step 1: Implement manifest functions**

Create `src/manifest.ts`:

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Manifest } from "./types.js";

const MANIFEST_FILE = ".manifest.json";

export function createEmptyManifest(): Manifest {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    meetings: {},
  };
}

export async function readManifest(outputDir: string): Promise<Manifest> {
  try {
    const raw = await readFile(join(outputDir, MANIFEST_FILE), "utf-8");
    return JSON.parse(raw) as Manifest;
  } catch {
    return createEmptyManifest();
  }
}

export function isProcessed(manifest: Manifest, meetingId: string): boolean {
  return manifest.meetings[meetingId]?.status === "processed";
}

export function markProcessed(
  manifest: Manifest,
  meetingId: string,
  date: string,
  folder: string,
): void {
  manifest.meetings[meetingId] = { status: "processed", date, folder };
  manifest.lastUpdated = new Date().toISOString();
}

export async function writeManifest(
  outputDir: string,
  manifest: Manifest,
): Promise<void> {
  await writeFile(
    join(outputDir, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/manifest.ts
git commit -m "feat: add manifest module for idempotency tracking"
```

---

### Task 5: API Client

**Files:**
- Create: `src/api.ts`

**Step 1: Implement the GraphQL client**

Create `src/api.ts`:

```typescript
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { TranscriptListItem, Transcript } from "./types.js";

const ENDPOINT = "https://api.fireflies.ai/graphql";

class FirefliesApiError extends Error {
  constructor(
    message: string,
    public errors?: unknown[],
  ) {
    super(message);
    this.name = "FirefliesApiError";
  }
}

async function graphqlRequest<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new FirefliesApiError(
      `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new FirefliesApiError(
      json.errors.map((e) => e.message).join("; "),
      json.errors,
    );
  }

  if (!json.data) {
    throw new FirefliesApiError("No data in response");
  }

  return json.data;
}

const LIST_QUERY = `
  query Transcripts($limit: Int, $skip: Int, $mine: Boolean) {
    transcripts(limit: $limit, skip: $skip, mine: $mine) {
      id
      title
      date
      duration
    }
  }
`;

export async function listAllTranscripts(
  apiKey: string,
): Promise<TranscriptListItem[]> {
  const all: TranscriptListItem[] = [];
  let skip = 0;
  const limit = 50;

  while (true) {
    const data = await graphqlRequest<{
      transcripts: TranscriptListItem[];
    }>(apiKey, LIST_QUERY, { limit, skip, mine: true });

    if (!data.transcripts.length) break;

    all.push(...data.transcripts);
    skip += limit;
  }

  return all;
}

const TRANSCRIPT_QUERY = `
  query Transcript($id: String!) {
    transcript(id: $id) {
      id title date dateString duration
      audio_url video_url transcript_url
      host_email organizer_email meeting_link
      participants
      meeting_attendees { displayName email phoneNumber }
      speakers { id name }
      sentences { speaker_name speaker_id text raw_text start_time end_time }
      summary { keywords action_items outline topics_discussed transcript_chapters }
      analytics {
        sentiments { negative neutral positive }
        speakers { name duration word_count filler_words questions words_per_minute }
      }
    }
  }
`;

export async function fetchTranscript(
  apiKey: string,
  id: string,
): Promise<Transcript> {
  const data = await graphqlRequest<{ transcript: Transcript }>(
    apiKey,
    TRANSCRIPT_QUERY,
    { id },
  );
  return data.transcript;
}

/**
 * Derives file extension from content-type header.
 * e.g. "audio/mp4" -> ".mp4", "video/webm" -> ".webm"
 */
function extensionFromContentType(contentType: string | null): string {
  if (!contentType) return ".bin";
  const sub = contentType.split("/")[1]?.split(";")[0]?.trim();
  if (!sub) return ".bin";
  return `.${sub}`;
}

export async function downloadMedia(
  url: string,
  destPathWithoutExt: string,
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("No response body for media download");
  }

  const ext = extensionFromContentType(
    response.headers.get("content-type"),
  );
  const destPath = destPathWithoutExt + ext;

  const nodeStream = Readable.fromWeb(response.body as any);
  const fileStream = createWriteStream(destPath);
  await pipeline(nodeStream, fileStream);

  return destPath;
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat: add Fireflies GraphQL API client with pagination and media download"
```

---

### Task 6: File Writer

**Files:**
- Create: `src/writer.ts`

**Step 1: Implement the file writer**

Create `src/writer.ts`:

```typescript
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Transcript } from "./types.js";
import { sanitizeTitle, formatTimestamp } from "./utils.js";

export function buildYearMonth(dateMs: number): string {
  const d = new Date(dateMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export function buildFolderName(transcript: Transcript): string {
  const d = new Date(transcript.date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const datePrefix = `${yyyy}-${mm}-${dd}`;
  const title = sanitizeTitle(transcript.title || "untitled");
  return `${datePrefix}_${title}_${transcript.id}`;
}

function buildReadableTranscript(transcript: Transcript): string {
  if (!transcript.sentences?.length) return "(no transcript available)\n";

  const maxStartTime = Math.max(
    ...transcript.sentences.map((s) => s.start_time),
  );
  const longFormat = maxStartTime >= 3600;

  return transcript.sentences
    .map((s) => {
      const ts = formatTimestamp(s.start_time, longFormat);
      return `${ts} ${s.speaker_name}: ${s.text}`;
    })
    .join("\n") + "\n";
}

export interface WriteMeetingResult {
  /** Relative path from output root, e.g. "2026-03/2026-03-01_Standup_abc123" */
  folderRelative: string;
  /** Absolute path to the meeting folder */
  folderAbsolute: string;
}

export async function writeMeeting(
  outputDir: string,
  transcript: Transcript,
): Promise<WriteMeetingResult> {
  const yearMonth = buildYearMonth(transcript.date);
  const folderName = buildFolderName(transcript);
  const folderRelative = `${yearMonth}/${folderName}`;
  const folderAbsolute = join(outputDir, folderRelative);

  await mkdir(folderAbsolute, { recursive: true });

  // metadata.json — everything except sentences, summary, analytics
  const metadata = {
    id: transcript.id,
    title: transcript.title,
    date: transcript.date,
    dateString: transcript.dateString,
    duration: transcript.duration,
    audio_url: transcript.audio_url,
    video_url: transcript.video_url,
    transcript_url: transcript.transcript_url,
    host_email: transcript.host_email,
    organizer_email: transcript.organizer_email,
    meeting_link: transcript.meeting_link,
    participants: transcript.participants,
    meeting_attendees: transcript.meeting_attendees,
    speakers: transcript.speakers,
  };

  await Promise.all([
    writeFile(
      join(folderAbsolute, "metadata.json"),
      JSON.stringify(metadata, null, 2) + "\n",
    ),
    writeFile(
      join(folderAbsolute, "transcript.json"),
      JSON.stringify(transcript.sentences ?? [], null, 2) + "\n",
    ),
    writeFile(
      join(folderAbsolute, "summary.json"),
      JSON.stringify(transcript.summary ?? {}, null, 2) + "\n",
    ),
    writeFile(
      join(folderAbsolute, "analytics.json"),
      JSON.stringify(transcript.analytics ?? {}, null, 2) + "\n",
    ),
    writeFile(
      join(folderAbsolute, "transcript.txt"),
      buildReadableTranscript(transcript),
    ),
  ]);

  return { folderRelative, folderAbsolute };
}
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/writer.ts
git commit -m "feat: add file writer for meeting data (JSON + readable transcript)"
```

---

### Task 7: Entry Point & Orchestration

**Files:**
- Modify: `src/index.ts`

**Step 1: Implement the full orchestrator**

Replace `src/index.ts` with:

```typescript
#!/usr/bin/env npx tsx

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { password } from "@inquirer/prompts";
import { listAllTranscripts, fetchTranscript, downloadMedia } from "./api.js";
import {
  readManifest,
  isProcessed,
  markProcessed,
  writeManifest,
} from "./manifest.js";
import { writeMeeting } from "./writer.js";
import { parseArgs, printHelp, sleep } from "./utils.js";

const RATE_LIMIT_DELAY = 1200; // 1.2 seconds between transcript fetches

async function resolveApiKey(
  cliKey: string | undefined,
): Promise<string> {
  if (cliKey) return cliKey;

  const envKey = process.env.FIREFLIES_API_KEY;
  if (envKey) return envKey;

  const prompted = await password({
    message: "Enter your Fireflies.ai API key:",
  });
  if (!prompted) {
    console.error("Error: API key is required.");
    process.exit(1);
  }
  return prompted;
}

function formatDateForLog(dateMs: number): string {
  return new Date(dateMs).toISOString().split("T")[0];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  if (options.help) {
    printHelp();
    return;
  }

  const apiKey = await resolveApiKey(options.apiKey);
  const outputDir = options.output;

  await mkdir(outputDir, { recursive: true });

  const manifest = await readManifest(outputDir);

  console.log("Fetching meeting list...");
  const allMeetings = await listAllTranscripts(apiKey);
  console.log(`Found ${allMeetings.length} meetings.\n`);

  let newCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < allMeetings.length; i++) {
    const meeting = allMeetings[i];
    const index = `[${i + 1}/${allMeetings.length}]`;
    const dateStr = formatDateForLog(meeting.date);

    if (!options.force && isProcessed(manifest, meeting.id)) {
      skippedCount++;
      continue;
    }

    console.log(`${index} Processing: "${meeting.title}" (${dateStr})...`);

    try {
      const transcript = await fetchTranscript(apiKey, meeting.id);
      const { folderRelative, folderAbsolute } = await writeMeeting(
        outputDir,
        transcript,
      );

      if (options.includeMedia) {
        if (transcript.audio_url) {
          try {
            await downloadMedia(
              transcript.audio_url,
              join(folderAbsolute, "audio"),
            );
            await sleep(RATE_LIMIT_DELAY);
          } catch (err) {
            console.error(`  Warning: failed to download audio — ${err}`);
          }
        }
        if (transcript.video_url) {
          try {
            await downloadMedia(
              transcript.video_url,
              join(folderAbsolute, "video"),
            );
            await sleep(RATE_LIMIT_DELAY);
          } catch (err) {
            console.error(`  Warning: failed to download video — ${err}`);
          }
        }
      }

      markProcessed(
        manifest,
        meeting.id,
        new Date(meeting.date).toISOString(),
        folderRelative,
      );
      await writeManifest(outputDir, manifest);
      newCount++;
    } catch (err) {
      console.error(`  Error: ${err}`);
      failedCount++;
    }

    // Rate limit delay before next transcript fetch
    if (i < allMeetings.length - 1) {
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  console.log(
    `\nDone! ${newCount} new meetings downloaded, ${skippedCount} skipped (already synced), ${failedCount} failed.`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

**Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

**Step 3: Verify --help works**

```bash
npx tsx src/index.ts --help
```

Expected: prints the usage help text.

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI entry point with full orchestration loop"
```

---

### Task 8: Make the bin entry executable + add .gitignore

**Files:**
- Modify: `src/index.ts` (ensure shebang)
- Create: `.gitignore`

**Step 1: Make executable and add .gitignore**

```bash
chmod +x src/index.ts
```

Create `.gitignore`:

```
node_modules/
dist/
fireflies-meetings/
```

**Step 2: Verify end-to-end**

```bash
npx tsx src/index.ts --help
```

Expected: prints help. Tool is now fully functional — ready for a real API key test.

**Step 3: Commit**

```bash
git add .gitignore src/index.ts
git commit -m "chore: add .gitignore, make entry point executable"
```

---

### Task 9: Final Review

**Step 1: Verify full project compiles**

```bash
npx tsc --noEmit
```

**Step 2: Dry-run with --help**

```bash
npx tsx src/index.ts --help
```

**Step 3: Review all files for consistency**

Read through each file and verify:
- All imports resolve correctly (`.js` extensions for ESM)
- Types are consistent across modules
- No unused imports or dead code
- Error messages are clear for end users
