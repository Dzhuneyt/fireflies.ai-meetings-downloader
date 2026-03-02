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

  const maxStartTime = transcript.sentences.reduce(
    (max, s) => Math.max(max, s.start_time), 0,
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
