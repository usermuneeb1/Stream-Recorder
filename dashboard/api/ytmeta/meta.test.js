import { describe, it, expect } from 'vitest';
import { parseChapters, buildStoryboardVtt, fmtVtt } from './[id].js';

describe('ytmeta parseChapters', () => {
  it('parses description timestamp lines into chapters', () => {
    const desc = [
      'A great stream',
      '00:00 Intro and welcome',
      '12:34 - The main topic begins',
      '1:02:00 Q&A session',
      'https://example.com/x',
    ].join('\n');
    expect(parseChapters(desc)).toEqual([
      { time: 0, label: 'Intro and welcome' },
      { time: 754, label: 'The main topic begins' },
      { time: 3720, label: 'Q&A session' },
    ]);
  });

  it('accepts title-before-timestamp lines too', () => {
    const desc = 'Intro 00:00\nDeep dive 05:00\nFinale 10:00\n';
    expect(parseChapters(desc).map((c) => c.label)).toEqual(['Intro', 'Deep dive', 'Finale']);
  });

  it('rejects fewer than 3 chapters (YouTube rule)', () => {
    expect(parseChapters('00:00 Only\n05:00 Two\n')).toEqual([]);
  });

  it('rejects chapters not starting at ~0:00', () => {
    expect(parseChapters('00:30 Late start\n05:00 Mid\n10:00 End\n')).toEqual([]);
  });

  it('ignores non-timestamp numbers like 1080p', () => {
    expect(parseChapters('Recorded in 1080p\n00:00 A\n01:00 B\n02:00 C\n')).toHaveLength(3);
  });
});

describe('ytmeta buildStoryboardVtt', () => {
  const spec = [{
    templateUrl: 'https://i9.ytimg.com/sb/abc/storyboard3_L0/$M.jpg?sigh=x',
    url: 'https://i9.ytimg.com/sb/abc/storyboard3_L0/0.jpg?sigh=x',
    width: 160, height: 90, count: 2, interval: 5000,
    storyboardWidth: 320, storyboardHeight: 180, storyboardCount: 1,
  }];

  it('emits #xywh cues across tiles and images', () => {
    const vtt = buildStoryboardVtt(spec, 60);
    const lines = vtt.split('\n');
    expect(lines[0]).toBe('WEBVTT');
    // 2 images × 2 cols × 2 rows = 8 cues
    expect(vtt.match(/-->/g)).toHaveLength(8);
    expect(vtt).toContain('00:00:00.000 --> 00:00:05.000');
    expect(vtt).toContain('storyboard3_L0/0.jpg?sigh=x#xywh=0,0,160,90');
    expect(vtt).toContain('storyboard3_L0/1.jpg?sigh=x#xywh=160,90,160,90');
  });

  it('caps cues at the video duration', () => {
    const vtt = buildStoryboardVtt(spec, 12);
    // 12s / 5s per frame = 3 cues (last ends exactly at 12s)
    expect(vtt.match(/-->/g)).toHaveLength(3);
    expect(vtt).toContain('--> 00:00:12.000');
  });

  it('returns empty when there is no usable spec', () => {
    expect(buildStoryboardVtt([], 60)).toBe('');
    expect(buildStoryboardVtt(null, 60)).toBe('');
    expect(buildStoryboardVtt([{ url: '', width: 0 }], 60)).toBe('');
  });

  it('formats VTT timestamps', () => {
    expect(fmtVtt(0)).toBe('00:00:00.000');
    expect(fmtVtt(3723.5)).toBe('01:02:03.500');
  });
});
