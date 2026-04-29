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
  negative_pct: number;
  positive_pct: number;
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
  since: string | undefined;
  mineOnly: boolean;
  help: boolean;
}
