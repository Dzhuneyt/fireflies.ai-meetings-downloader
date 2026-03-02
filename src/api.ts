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
