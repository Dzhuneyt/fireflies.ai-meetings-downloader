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
