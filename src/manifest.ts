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
