import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real edge handler and its GitHub read/modify/write boundary.
// All network calls are mocked; no repository comments are read or changed.
describe('comments storage safety', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GH_TOKEN', 'test-only-token');
    vi.stubEnv('COMMENTS_PASSPHRASE', 'test-only-passphrase');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function run(content, payload = { name: "Test Reader", text: "A new comment", passphrase: "test-only-passphrase" }) {
    const puts = [];
    const fetchMock = vi.fn(async (_url, options = {}) => {
      if ((options.method || 'GET') === 'GET') {
        return Response.json({ sha: 'existing-blob-sha', content: btoa(content) });
      }
      puts.push(JSON.parse(options.body));
      return Response.json({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const { default: handler } = await import('./[id].js');
    const request = new Request('https://dashboard.test/api/comments/abcdefghijk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const response = await handler(request);
    return { response, puts };
  }

  it('reports authenticated storage outages instead of claiming there are no comments', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 503 })));
    const { default: handler } = await import('./[id].js');
    const response = await handler(new Request('https://dashboard.test/api/comments/abcdefghijk'));
    expect(response.status).toBe(503);
  });

  it('does not bypass conversation validation on the tokenless CDN path', async () => {
    vi.stubEnv('GH_TOKEN', '');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ abcdefghijk: [null] })));
    const { default: handler } = await import('./[id].js');
    const response = await handler(new Request('https://dashboard.test/api/comments/abcdefghijk'));
    expect(response.status).toBe(503);
  });

  it('returns an empty list for a genuinely absent conversation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      sha: 'existing', content: btoa(JSON.stringify({ 'another-video': [] })),
    })));
    const { default: handler } = await import('./[id].js');
    const response = await handler(new Request('https://dashboard.test/api/comments/abcdefghijk'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ comments: [] });
  });

  it('refuses to overwrite existing storage when its JSON cannot be decoded', async () => {
    const { response, puts } = await run('{"previous-video":[{"n":"Existing","t":"Keep me"}]');
    expect(puts, 'corrupt storage must never be replaced by a one-comment database').toHaveLength(0);
    expect(response.status).toBe(503);
  });

  it('refuses to overwrite storage whose JSON has the wrong top-level shape', async () => {
    const { response, puts } = await run(JSON.stringify([{ n: 'wrong', t: 'array' }]));
    expect(puts).toHaveLength(0);
    expect(response.status).toBe(503);
  });

  it('refuses to replace a corrupt per-video comment list', async () => {
    const { response, puts } = await run(JSON.stringify({ abcdefghijk: { corrupt: true } }));
    expect(puts).toHaveLength(0);
    expect(response.status).toBe(503);
  });

  it('rejects a null JSON body without crashing', async () => {
    const { response, puts } = await run('{}', null);
    expect(puts).toHaveLength(0);
    expect(response.status).toBe(400);
  });

  it('preserves existing comments when the stored JSON is valid', async () => {
    const previous = { 'previous-video': [{ n: 'Existing', t: 'Keep me', at: '2026-10-01' }] };
    const { response, puts } = await run(JSON.stringify(previous));
    expect(response.status).toBe(200);
    expect(puts).toHaveLength(1);
    const saved = JSON.parse(atob(puts[0].content));
    expect(saved['previous-video']).toEqual(previous['previous-video']);
    expect(saved.abcdefghijk[0].t).toBe('A new comment');
    expect(puts[0].sha).toBe('existing-blob-sha');
  });
});
