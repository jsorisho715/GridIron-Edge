import { expect, test } from 'bun:test';
import { trashTalk } from '../src/lib/trash-talk';

test('both tones provide a full unique rotation for every opponent', () => {
  for (let id = 1; id <= 12; id++) for (const tone of ['sharp', 'spicy'] as const) {
    const lines = trashTalk({ id, name: `Team ${id}` }, tone);
    expect(new Set(lines).size).toBe(6);
    expect(lines.every(line => line.includes(`Team ${id}`))).toBe(true);
    expect(lines.every(line => line.length < 250)).toBe(true);
    expect(lines).toEqual(trashTalk({ id, name: `Team ${id}` }, tone));
  }
});

test('missing names and invalid IDs have safe drafts without invented stats', () => {
  const lines = trashTalk({ id: NaN, name: ' ' }, 'sharp');
  expect(lines).toHaveLength(6);
  expect(lines.every(line => line.startsWith('Your team'))).toBe(true);
  expect(lines.join(' ')).not.toMatch(/undefined|NaN|injur|\d/);
  expect(trashTalk({ id: 2, name: 'Bears' }, 'spicy')).not.toEqual(trashTalk({ id: 2, name: 'Bears' }, 'sharp'));
});
