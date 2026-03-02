# Fireflies.ai Meetings Extractor

Pull your entire Fireflies.ai meeting catalog to your local filesystem.

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/8c2a53a5-4bda-4fee-b33b-fea99594290d" />


## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later (LTS recommended)
## Setup

```bash
git clone https://github.com/Dzhuneyt/fireflies.ai-meetings-downloader.git
cd fireflies.ai-meetings-downloader
npm install    # or: pnpm install / yarn install
```

## Getting Your API Key

1. Log in to [Fireflies.ai](https://app.fireflies.ai/)
2. Go to **Settings → Developer Settings** (or visit `app.fireflies.ai/settings`)
3. Copy your API key

## Usage

```bash
# Pass the key directly
npx tsx src/index.ts --api-key YOUR_API_KEY

# Or set it as an environment variable
export FIREFLIES_API_KEY=YOUR_API_KEY
npx tsx src/index.ts

# Or just run it — you'll be prompted to enter the key
npx tsx src/index.ts
```

### CLI Options

```
--api-key <key>     Fireflies API key (or set FIREFLIES_API_KEY env var)
--output <dir>      Output directory (default: ./fireflies-meetings)
--force             Reprocess all meetings, ignoring manifest
--include-media     Also download audio/video files (skipped by default)
--help              Show help
```

### Examples

```bash
# Download all meetings to a custom folder
npx tsx src/index.ts --output ~/my-meetings

# Re-download everything (ignore previous progress)
npx tsx src/index.ts --force

# Include audio/video files (slower, uses more disk space)
npx tsx src/index.ts --include-media

# Add audio/video to already-downloaded meetings (--force to reprocess them)
npx tsx src/index.ts --include-media --force
```

## Output Structure

Meetings are organized by year-month. Each meeting gets its own folder:

```
fireflies-meetings/
├── .manifest.json              # Tracks progress (don't delete this)
├── 2026-03/
│   ├── 2026-03-01_Project-Standup_abc123/
│   │   ├── metadata.json       # Meeting info (participants, duration, links)
│   │   ├── transcript.json     # Raw transcript data with timestamps
│   │   ├── transcript.txt      # Human-readable transcript
│   │   ├── summary.json        # Keywords, action items, topics
│   │   ├── analytics.json      # Sentiment scores, speaker stats
│   │   ├── audio.mp4           # Audio file (only with --include-media)
│   │   └── video.mp4           # Video file (only with --include-media)
│   └── 2026-03-05_Sprint-Review_def456/
│       └── ...
└── 2026-02/
    └── ...
```

**`transcript.txt`** is the main file most people will want. It looks like:

```
[00:05] Alice: Good morning everyone, let's get started.
[00:12] Bob: Sure, I have a few updates from yesterday.
```

## Resuming & Re-running

The tool tracks which meetings have been downloaded in `.manifest.json`. If you run it again, it skips already-downloaded meetings and only fetches new ones. Use `--force` to re-download everything.

If a run is interrupted (Ctrl+C, network error), just run it again — it picks up where it left off.

## Rate Limits

The Fireflies API enforces different rate limits depending on your plan:

| Plan | Limit |
|------|-------|
| Free / Pro | **50 requests per day** |
| Business / Enterprise | **60 requests per minute** |

The tool paces itself with a 1.2-second delay between requests, which fits within the Business/Enterprise limit. **If you are on the Free or Pro plan**, you will likely exceed the 50 requests/day cap during a single run — each meeting requires at least one API call. If you have more than ~50 meetings, the run will need to span multiple days (the tool resumes where it left off thanks to the manifest).

For the latest limits, see the [Fireflies API Limits](https://docs.fireflies.ai/fundamentals/limits) documentation.
