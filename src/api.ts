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
    let body: string;
    try {
      body = await response.text();
    } catch {
      body = "(could not read response body)";
    }
    throw new FirefliesApiError(
      `HTTP ${response.status} ${response.statusText}\n  Response body: ${body}`,
    );
  }

  let rawText: string;
  try {
    rawText = await response.text();
  } catch (err) {
    throw new FirefliesApiError(`Failed to read response body: ${err}`);
  }

  let json: { data?: T; errors?: { message: string }[] };
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new FirefliesApiError(
      `Response is not valid JSON:\n  ${rawText.slice(0, 500)}`,
    );
  }

  if (json.errors?.length) {
    throw new FirefliesApiError(
      `GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}\n  Full response: ${rawText.slice(0, 500)}`,
      json.errors,
    );
  }

  if (!json.data) {
    throw new FirefliesApiError(
      `No data in response:\n  ${rawText.slice(0, 500)}`,
    );
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
  mineOnly: boolean = false,
): Promise<TranscriptListItem[]> {
  const all: TranscriptListItem[] = [];
  let skip = 0;
  const limit = 50;

  while (true) {
    const data = await graphqlRequest<{
      transcripts: TranscriptListItem[];
    }>(apiKey, LIST_QUERY, { limit, skip, mine: mineOnly });

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
        sentiments { negative_pct positive_pct }
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
 * Falls back to the URL's own extension when the content-type is
 * generic (e.g. application/octet-stream).
 */
function extensionFromContentType(
  contentType: string | null,
  url: string,
): string {
  if (contentType && contentType !== "application/octet-stream") {
    const sub = contentType.split("/")[1]?.split(";")[0]?.trim();
    if (sub) return `.${sub}`;
  }

  // Fall back to the extension from the URL path (strip query string first)
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\.(\w+)$/);
  if (match) return `.${match[1]}`;

  return ".bin";
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
    url,
  );
  const destPath = destPathWithoutExt + ext;

  const nodeStream = Readable.fromWeb(response.body as any);
  const fileStream = createWriteStream(destPath);
  await pipeline(nodeStream, fileStream);

  return destPath;
}
