/** Convert seconds to frames at a given FPS */
export function secondsToFrames(seconds: number, fps = 30): number {
  return Math.round(seconds * fps);
}

/** Convert frames to seconds at a given FPS */
export function framesToSeconds(frames: number, fps = 30): number {
  return frames / fps;
}

/** Check if the current frame is within a scene's range */
export function isInScene(frame: number, sceneStart: number, sceneDuration: number): boolean {
  return frame >= sceneStart && frame < sceneStart + sceneDuration;
}

/** Get the local frame number within a scene (0-based) */
export function localFrame(frame: number, sceneStart: number): number {
  return Math.max(0, frame - sceneStart);
}

/** Calculate total duration from scene durations */
export function totalDuration(scenes: number[]): number {
  return scenes.reduce((sum, d) => sum + d, 0);
}
