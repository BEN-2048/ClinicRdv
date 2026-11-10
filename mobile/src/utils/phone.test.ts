import { formatDrcPhone, normalizeDrcPhone } from './phone';

describe('normalizeDrcPhone (mobile)', () => {
  test.each([
    ['0812345678', '+243812345678'],
    ['081 234 5678', '+243812345678'],
    ['+243 99 123 4567', '+243991234567'],
    ['00243812345678', '+243812345678'],
    ['812345678', '+243812345678'],
  ])('%s', (input, expected) => {
    expect(normalizeDrcPhone(input)).toBe(expected);
  });

  test.each([['0712345678'], ['+33612345678'], ['abc'], ['08123']])('refuse %s', (input) => {
    expect(normalizeDrcPhone(input)).toBeNull();
  });

  test('formatage lisible', () => {
    expect(formatDrcPhone('+243812345678')).toBe('+243 81 234 5678');
  });
});
