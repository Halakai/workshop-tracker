import { describe, expect, it } from 'vitest';
import { formatKeyCode, normalizeKeyCode } from './customerKeys';

describe('customer key codes', () => {
  it('reads the code however it was typed', () => {
    expect(normalizeKeyCode('k7m4-qx9p')).toBe('K7M4QX9P');
    expect(normalizeKeyCode(' K7M4 QX9P ')).toBe('K7M4QX9P');
    expect(normalizeKeyCode('')).toBe('');
  });

  it('shows it in two halves', () => {
    expect(formatKeyCode('K7M4QX9P')).toBe('K7M4-QX9P');
    expect(formatKeyCode('ABC')).toBe('ABC');
  });
});
