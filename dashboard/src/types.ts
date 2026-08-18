// Shared domain types for The Lantern Archive.

export interface Storyboard {
  url: string;       // sprite-sheet JPEG (archive.org)
  vtt: string;       // WebVTT cues pointing into the sprite
  interval?: number;
  cols?: number;
  rows?: number;
  n_frames?: number;
  w?: number;
  h?: number;
}

export interface Chapter {
  time: number;  // seconds from stream start
  label: string;
}

export interface Recording {
  videoId: string;
  title: string;
  channel: string;
  date: string;            // YYYY-MM-DD
  recordedAt: string;      // ISO
  videoUrl: string;        // original YouTube watch URL
  durationSec: number;
  durationFmt: string;     // "1h 56m"
  sizeHuman: string;       // "374.38 MB"
  sizeGb: number;
  resolution: string;      // "1920x1080"
  thumbnail: string;
  archiveLink: string;
  archiveDirect: string;
  archiveNode: string;
  megaLink: string;
  pixeldrainLink: string;
  gofileLink: string;
  githubRelease: string;
  githubDirect: string;
  telegramLink: string;
  cfStream: string;
  chatUrl?: string;         // archived live chat
  youtubeUnlisted: string;
  youtubeId: string;
  storyboard?: Storyboard;
  chapters?: Chapter[];
  transcriptUrl?: string;
}

export interface YTVideo {
  videoId: string;
  title: string;
  published: string;      // ISO
  description: string;
  thumb: string;
  views: number;
}

export interface Ep extends Recording {
  ep: number;             // chronological order (internal sorting only — never displayed)
  season: string;         // "August 2026" (month grouping)
  matchPct: number;       // deterministic 91–99
  isNew: boolean;         // recorded within 14 days
  isForced?: boolean;     // manual / forced recording (filtered out of the web UI)
  fromYouTube?: boolean;  // came from the channel feed, not the recording pipeline
  isShort?: boolean;      // vertical short from the channel's shorts playlist
  viewCount?: number;     // YouTube views (feed videos)
}

export interface SystemStatus {
  updatedAt: string;
  recordingsTotal: number;
  totalSizeGb: number;
  totalHours: number;
  ytSubscribers: string;
  ytViews: string;
  ytVideos: number;
  ok: boolean;
}

export interface StreamPrediction {
  peakDays: string[];       // e.g. ["Friday", "Saturday"]
  peakHoursPkt: number[];   // e.g. [20, 21, 22]
  avgGapDays: number;
}

export type Route =
  | { kind: 'home' }
  | { kind: 'browse' }
  | { kind: 'shorts' }
  | { kind: 'system' }
  | { kind: 'stats' }
  | { kind: 'mylist' }
  | { kind: 'watch'; rec: Ep }
  | { kind: 'watch-pending'; id: string }
  | { kind: 'notfound' };
