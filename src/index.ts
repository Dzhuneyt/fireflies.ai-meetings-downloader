#!/usr/bin/env npx tsx

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { password } from "@inquirer/prompts";
import PQueue from "p-queue";
import { listAllTranscripts, fetchTranscript, downloadMedia } from "./api.js";
import {
  readManifest,
  isProcessed,
  markProcessed,
  writeManifest,
} from "./manifest.js";
import { writeMeeting } from "./writer.js";
import { parseArgs, parseSince, printHelp } from "./utils.js";

// 1.2s between transcript fetches keeps us under the Business/Enterprise
// 60-req/min ceiling. Media downloads hit a CDN, not the GraphQL API,
// so they run on a separate queue with no rate limit.
const TRANSCRIPT_INTERVAL_MS = 1200;
const MEDIA_CONCURRENCY = 4;

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

  let sinceCutoff: number | undefined;
  if (options.since) {
    try {
      sinceCutoff = parseSince(options.since);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(1);
    }
    console.log(
      `Filtering to meetings on or after ${new Date(sinceCutoff).toISOString()}`,
    );
  }

  console.log("Fetching meeting list...");
  let allMeetings;
  try {
    allMeetings = await listAllTranscripts(apiKey, options.mineOnly);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to fetch meeting list:\n  ${message}`);
    process.exit(1);
  }
  const totalFetched = allMeetings.length;
  if (sinceCutoff !== undefined) {
    allMeetings = allMeetings.filter((m) => m.date >= sinceCutoff!);
    console.log(
      `Found ${totalFetched} meetings, ${allMeetings.length} within --since window.\n`,
    );
  } else {
    console.log(`Found ${allMeetings.length} meetings.\n`);
  }

  let newCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let mediaCompleted = 0;
  let mediaFailed = 0;

  const transcriptQueue = new PQueue({
    concurrency: 1,
    intervalCap: 1,
    interval: TRANSCRIPT_INTERVAL_MS,
  });
  const mediaQueue = new PQueue({ concurrency: MEDIA_CONCURRENCY });

  const total = allMeetings.length;
  for (let i = 0; i < allMeetings.length; i++) {
    const meeting = allMeetings[i];
    const tag = `[T ${i + 1}/${total}]`;
    const dateStr = formatDateForLog(meeting.date);

    if (!options.force && isProcessed(manifest, meeting.id)) {
      console.log(`${tag} skip "${meeting.title}" (${dateStr}) — already synced`);
      skippedCount++;
      continue;
    }

    transcriptQueue.add(async () => {
      console.log(`${tag} processing "${meeting.title}" (${dateStr})`);
      try {
        const transcript = await fetchTranscript(apiKey, meeting.id);
        const { folderRelative, folderAbsolute } = await writeMeeting(
          outputDir,
          transcript,
        );

        markProcessed(
          manifest,
          meeting.id,
          new Date(meeting.date).toISOString(),
          folderRelative,
        );
        await writeManifest(outputDir, manifest);
        newCount++;
        console.log(`${tag} done "${meeting.title}"`);

        if (options.includeMedia) {
          // ULID timestamp prefix collides across same-minute meetings; the
          // suffix is the random component, so it disambiguates reliably.
          const shortId = meeting.id.slice(-8);
          if (transcript.audio_url) {
            mediaQueue.add(async () => {
              const mtag = `[A ${shortId}]`;
              console.log(`${mtag} downloading audio for "${meeting.title}"`);
              try {
                const path = await downloadMedia(
                  transcript.audio_url!,
                  join(folderAbsolute, "audio"),
                );
                mediaCompleted++;
                console.log(`${mtag} saved ${path}`);
              } catch (err) {
                mediaFailed++;
                console.error(`${mtag} failed — ${err}`);
              }
            });
          }
          if (transcript.video_url) {
            mediaQueue.add(async () => {
              const mtag = `[V ${shortId}]`;
              console.log(`${mtag} downloading video for "${meeting.title}"`);
              try {
                const path = await downloadMedia(
                  transcript.video_url!,
                  join(folderAbsolute, "video"),
                );
                mediaCompleted++;
                console.log(`${mtag} saved ${path}`);
              } catch (err) {
                mediaFailed++;
                console.error(`${mtag} failed — ${err}`);
              }
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${tag} error "${meeting.title}" (id=${meeting.id}): ${message}`);
        failedCount++;
      }
    });
  }

  await transcriptQueue.onIdle();
  if (options.includeMedia && mediaQueue.size + mediaQueue.pending > 0) {
    console.log(
      `\nTranscripts done. Waiting on ${mediaQueue.size + mediaQueue.pending} media downloads...`,
    );
  }
  await mediaQueue.onIdle();

  const mediaSummary = options.includeMedia
    ? ` Media: ${mediaCompleted} downloaded, ${mediaFailed} failed.`
    : "";
  console.log(
    `\nDone! ${newCount} new meetings downloaded, ${skippedCount} skipped (already synced), ${failedCount} failed.${mediaSummary}`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
