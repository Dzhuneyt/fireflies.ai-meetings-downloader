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
    since: undefined,
    mineOnly: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--api-key":
        if (i + 1 < args.length) options.apiKey = args[++i];
        break;
      case "--output":
        if (i + 1 < args.length) options.output = args[++i];
        break;
      case "--force":
        options.force = true;
        break;
      case "--include-media":
        options.includeMedia = true;
        break;
      case "--since":
        if (i + 1 < args.length) options.since = args[++i];
        break;
      case "--mine-only":
        options.mineOnly = true;
        break;
      case "--help":
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * Parses a relative duration like "7d", "2w", "1m", "1y" and returns the
 * absolute cutoff timestamp (ms). `m` is months, not minutes — minutes are
 * not useful for meeting filtering.
 */
export function parseSince(input: string): number {
  const match = input.match(/^(\d+)(d|w|m|y)$/);
  if (!match) {
    throw new Error(
      `Invalid --since value "${input}". Expected formats: 7d, 2w, 1m, 1y.`,
    );
  }
  const n = Number.parseInt(match[1], 10);
  const unit = match[2];
  const cutoff = new Date();
  switch (unit) {
    case "d": cutoff.setDate(cutoff.getDate() - n); break;
    case "w": cutoff.setDate(cutoff.getDate() - n * 7); break;
    case "m": cutoff.setMonth(cutoff.getMonth() - n); break;
    case "y": cutoff.setFullYear(cutoff.getFullYear() - n); break;
  }
  return cutoff.getTime();
}

export function printHelp(): void {
  console.log(`
Usage: fireflies-pull [options]

Options:
  --api-key <key>     Fireflies API key (or set FIREFLIES_API_KEY env var)
  --output <dir>      Output directory (default: ./fireflies-meetings)
  --force             Reprocess all meetings, ignoring manifest
  --include-media     Also download audio/video files (skipped by default)
  --since <duration>  Only fetch meetings newer than the given duration.
                      Format: <N><d|w|m|y> (m = months, not minutes).
                      Examples: 7d, 2w, 1m, 1y
  --mine-only         Only meetings you hosted (default: include shared)
  --help              Show help
`.trim());
}
