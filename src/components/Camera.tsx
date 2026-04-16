import type { ReactNode } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';

export interface CameraKeyframe {
  frame: number;
  zoom: number;
  /** Focus X: 0-100% of content width (50 = center) */
  focusX: number;
  /** Focus Y: 0-100% of content height (50 = center) */
  focusY: number;
}

export interface CameraProps {
  keyframes: CameraKeyframe[];
  enabled?: boolean;
  contentWidth?: number;
  contentHeight?: number;
  children: ReactNode;
}

/**
 * Attempt ease-in-out between each pair of keyframes.
 * Remotion's interpolate only supports a single easing for the entire range,
 * so we find the active segment and interpolate within it.
 */
function easedInterpolate(frame: number, keyframes: { frame: number; value: number }[]): number {
  if (keyframes.length === 1) return keyframes[0].value;
  if (frame <= keyframes[0].frame) return keyframes[0].value;
  if (frame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value;

  // Find active segment
  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1].frame <= frame) i++;

  const from = keyframes[i];
  const to = keyframes[i + 1];

  return interpolate(frame, [from.frame, to.frame], [from.value, to.value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
}

/**
 * Virtual camera. Renders children at contentWidth x contentHeight,
 * then zooms/pans/crops to fit the composition dimensions.
 * Uses ease-in-out cubic between keyframes for cinematic movement.
 */
export const Camera: React.FC<CameraProps> = ({
  keyframes,
  enabled = true,
  contentWidth = 1920,
  contentHeight = 1080,
  children,
}) => {
  const frame = useCurrentFrame();
  const { width: vpWidth, height: vpHeight } = useVideoConfig();

  if (!enabled || keyframes.length === 0) {
    return <>{children}</>;
  }

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  const zoom = easedInterpolate(
    frame,
    sorted.map((k) => ({ frame: k.frame, value: k.zoom })),
  );
  const focusX = easedInterpolate(
    frame,
    sorted.map((k) => ({ frame: k.frame, value: k.focusX })),
  );
  const focusY = easedInterpolate(
    frame,
    sorted.map((k) => ({ frame: k.frame, value: k.focusY })),
  );

  const baseScale = Math.max(vpWidth / contentWidth, vpHeight / contentHeight);
  const totalScale = baseScale * zoom;

  const fpx = (contentWidth * focusX) / 100;
  const fpy = (contentHeight * focusY) / 100;

  const tx = vpWidth / 2 - fpx * totalScale;
  const ty = vpHeight / 2 - fpy * totalScale;

  return (
    <div
      style={{
        position: 'absolute',
        width: vpWidth,
        height: vpHeight,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: contentWidth,
          height: contentHeight,
          transformOrigin: '0 0',
          transform: `translate(${tx}px, ${ty}px) scale(${totalScale})`,
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
};
