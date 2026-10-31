import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRecordings } from './fetcher';

afterEach(() => vi.unstubAllGlobals());

const valid = {
  video_id: 'abcdefghijk', title: 'Valid recording', channel: 'The Muslim Lantern',
  date: '2026-10-31', video_url: 'https://www.youtube.com/watch?v=abcdefghijk',
};

describe('archive CDN fallback', () => {
  it('falls back when a 200 JSON response contains malformed rows', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return Response.json(url.startsWith('https://cdn.jsdelivr.net/') ? [valid] : [null]);
    });
    vi.stubGlobal('fetch', fetchMock);
    const rows = await fetchRecordings();
    expect(rows.map(r => r.videoId)).toEqual(['abcdefghijk']);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('archive-only recordings', () => {
  it('keeps a valid canonical id when the source has no YouTube watch URL', async () => {
    const archiveOnly = { ...valid, video_id: 'archive-personal-backup-001', video_url: '',
      archive_link: 'https://archive.org/details/personal-backup-001',
      archive_direct: 'https://archive.org/download/personal-backup-001/video.mp4' };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([archiveOnly])));
    const rows = await fetchRecordings();
    expect(rows.map(r => r.videoId)).toEqual(['archive-personal-backup-001']);
    expect(rows[0].archiveDirect).toBe(archiveOnly.archive_direct);
  });
});

describe('comments loading', () => {
  it('distinguishes an unavailable backend from a genuinely empty conversation', async () => {
    const loader = await import('./fetcher');
    expect(typeof loader.fetchComments).toBe('function');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'storage unavailable' }, { status: 503 })));
    await expect(loader.fetchComments('abcdefghijk')).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ comments: [] })));
    await expect(loader.fetchComments('abcdefghijk')).resolves.toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ comments: [null] })));
    await expect(loader.fetchComments('abcdefghijk')).resolves.toBeNull();
  });
});

describe('chat CDN fallback', () => {
  it('rejects malformed messages instead of crashing the replay component', async () => {
    const valid = { messages: [{ t: 1, a: 'Reader', m: 'Hello' }] };
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      Response.json(String(input).startsWith('https://cdn.jsdelivr.net/') ? valid : { messages: [null] }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchChat } = await import('./fetcher');
    await expect(fetchChat('abcdefghijk')).resolves.toEqual(valid);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });
});
