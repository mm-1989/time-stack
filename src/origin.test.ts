import { describe, it, expect } from 'vitest';
import {
  parseOriginFromUrl, initialMsForOrigin, formatDateForUrl, remainingMs,
} from './origin';

describe('parseOriginFromUrl', () => {
  it('returns null when no since/until', () => {
    expect(parseOriginFromUrl(new URL('http://x/'))).toBeNull();
  });

  it('parses ?since=now as NOW mode', () => {
    expect(parseOriginFromUrl(new URL('http://x/?since=now'))).toEqual({ mode: 'now' });
  });

  it('parses ?since=YYYY-MM-DD as CUSTOM', () => {
    const o = parseOriginFromUrl(new URL('http://x/?since=2000-01-01'));
    expect(o?.mode).toBe('custom');
    if (o?.mode === 'custom') {
      expect(o.date.getUTCFullYear()).toBe(2000);
    }
  });

  it('parses ?until=YYYY-MM-DD as COUNTDOWN', () => {
    const o = parseOriginFromUrl(new URL('http://x/?until=2026-12-31'));
    expect(o?.mode).toBe('countdown');
  });

  it('?until takes precedence over ?since when both present', () => {
    const o = parseOriginFromUrl(new URL('http://x/?since=2000-01-01&until=2026-12-31'));
    expect(o?.mode).toBe('countdown');
  });

  it('returns null for invalid date string', () => {
    expect(parseOriginFromUrl(new URL('http://x/?since=not-a-date'))).toBeNull();
  });
});

describe('initialMsForOrigin', () => {
  it('NOW returns 0', () => {
    expect(initialMsForOrigin({ mode: 'now' }, 1_000_000)).toBe(0);
  });

  it('CUSTOM returns elapsed (now - origin)', () => {
    const date = new Date('2000-01-01T00:00:00Z').getTime();
    const now = date + 5000;
    expect(initialMsForOrigin({ mode: 'custom', date: new Date(date) }, now)).toBe(5000);
  });

  it('CUSTOM with future origin returns 0 (no negative)', () => {
    const future = new Date(Date.now() + 1_000_000);
    expect(initialMsForOrigin({ mode: 'custom', date: future }, Date.now())).toBe(0);
  });

  it('COUNTDOWN returns 0 (residual is computed via remainingMs)', () => {
    expect(initialMsForOrigin({ mode: 'countdown', date: new Date() }, Date.now())).toBe(0);
  });
});

describe('remainingMs', () => {
  it('returns null for non-countdown', () => {
    expect(remainingMs({ mode: 'now' }, 0)).toBeNull();
    expect(remainingMs({ mode: 'custom', date: new Date() }, 0)).toBeNull();
  });

  it('returns positive ms for future target', () => {
    const future = new Date(1000);
    expect(remainingMs({ mode: 'countdown', date: future }, 500)).toBe(500);
  });

  it('returns negative ms for past target', () => {
    const past = new Date(500);
    expect(remainingMs({ mode: 'countdown', date: past }, 1000)).toBe(-500);
  });
});

describe('formatDateForUrl', () => {
  it('formats date as YYYY-MM-DDTHH:MM in local time', () => {
    const d = new Date(2024, 0, 15, 9, 30); // Jan 15, 2024 09:30 (local)
    expect(formatDateForUrl(d)).toBe('2024-01-15T09:30');
  });

  it('zero-pads month/day/hour/minute', () => {
    const d = new Date(2024, 4, 5, 7, 8);
    expect(formatDateForUrl(d)).toBe('2024-05-05T07:08');
  });
});
