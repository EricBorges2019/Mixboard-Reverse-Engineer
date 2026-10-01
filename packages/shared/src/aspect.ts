import type { AspectRatio } from './schemas';

/**
 * Numeric width/height ratio of an aspect-ratio label, read from the label itself
 * (block sizes are rounded for layout, so they are not used).
 * Precondition: `ratio` is an AspectRatio label of the form "W:H".
 * Postcondition: returns W/H as a positive number.
 */
export function ratioValue(ratio: AspectRatio): number {
  const [w, h] = ratio.split(':').map(Number);
  return w / h;
}

/**
 * Distance between two ratios on a log scale, so 4:3 vs 1:1 equals 16:9 vs 4:3.
 * Precondition: `a` and `b` are positive numbers.
 * Postcondition: returns a non-negative number rounded to 9 decimals so float noise cannot break ties.
 */
function logDistance(a: number, b: number): number {
  return Math.round(Math.abs(Math.log(a / b)) * 1e9) / 1e9;
}

/**
 * Picks the supported ratio numerically closest to a target.
 * Precondition: `supported` is non-empty.
 * Postcondition: returns a member of `supported`; returns `target` itself when supported; on a tie the earlier entry wins.
 */
export function nearestRatio(target: AspectRatio, supported: AspectRatio[]): AspectRatio {
  if (supported.includes(target)) return target;
  return nearestToValue(ratioValue(target), supported);
}

/**
 * Picks the supported ratio closest to a pixel size, e.g. a block's rect or an uploaded image.
 * Precondition: `w` and `h` are positive; `supported` is non-empty.
 * Postcondition: returns the member of `supported` closest to w/h; on a tie the earlier entry wins.
 */
export function nearestRatioForSize(w: number, h: number, supported: AspectRatio[]): AspectRatio {
  return nearestToValue(w / h, supported);
}

/**
 * Picks the supported ratio closest to a numeric width/height value.
 * Precondition: `value` is positive; `supported` is non-empty.
 * Postcondition: returns a member of `supported`; on a tie the earlier entry wins.
 */
function nearestToValue(value: number, supported: AspectRatio[]): AspectRatio {
  return supported.reduce((best, r) => (logDistance(ratioValue(r), value) < logDistance(ratioValue(best), value) ? r : best));
}
