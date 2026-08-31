import { describe, expect, it } from 'vitest';
import { tagColor } from './tagColor';

describe('tagColor', () => {
  it('returns a complete colour class string for a normal tag', () => {
    const classes = tagColor('priority');
    expect(classes).toContain('border-');
    expect(classes).toContain('bg-');
    expect(classes).toContain('text-');
  });

  it('is stable and case-insensitive', () => {
    expect(tagColor('Frontend')).toBe(tagColor(' frontend '));
    expect(tagColor('Frontend')).toBe(tagColor('FRONTEND'));
  });

  it('does not depend on process order for unknown input', () => {
    expect(tagColor('new-to-this-app')).toBe(tagColor('new-to-this-app'));
    expect(tagColor('another-unknown-tag')).not.toBe('');
  });

  it('uses a safe neutral treatment for empty input', () => {
    expect(tagColor('')).toBe(tagColor('   '));
    expect(tagColor('')).toContain('border-hairline');
    expect(tagColor('')).toContain('bg-surface-raised');
  });

  it('keeps different tags eligible for the fixed palette', () => {
    const classes = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon'].map(tagColor));
    expect(classes.size).toBeGreaterThan(1);
  });
});
