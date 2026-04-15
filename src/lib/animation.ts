import { spring, interpolate } from 'remotion';

/** Standard spring config - snappy with slight overshoot */
export const SPRING_SNAPPY = { damping: 200, mass: 0.6 } as const;

/** Gentle spring - for large elements or backgrounds */
export const SPRING_GENTLE = { damping: 100, mass: 1.2 } as const;

/** Bouncy spring - for attention-grabbing elements */
export const SPRING_BOUNCY = { damping: 80, mass: 0.5 } as const;

/** Create a spring value (0 to 1) starting at a given frame */
export function springAt(
  frame: number,
  startFrame: number,
  fps: number,
  config = SPRING_SNAPPY,
): number {
  if (frame < startFrame) return 0;
  return spring({
    frame: frame - startFrame,
    fps,
    config,
  });
}

/** Fade in: opacity from 0 to 1 over a frame range */
export function fadeIn(frame: number, startFrame: number, duration: number): number {
  return interpolate(frame, [startFrame, startFrame + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Fade out: opacity from 1 to 0 over a frame range */
export function fadeOut(frame: number, startFrame: number, duration: number): number {
  return interpolate(frame, [startFrame, startFrame + duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Slide in from bottom: translateY from offset to 0 */
export function slideInY(
  frame: number,
  startFrame: number,
  fps: number,
  offset = 40,
  config = SPRING_SNAPPY,
): number {
  const progress = springAt(frame, startFrame, fps, config);
  return offset * (1 - progress);
}
