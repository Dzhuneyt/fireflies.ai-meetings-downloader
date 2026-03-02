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
