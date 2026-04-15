import type { ReactNode } from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

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
 * Virtual camera. Renders children at contentWidth x contentHeight,
 * then zooms/pans/crops to fit the composition dimensions.
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

  const clamp = {
    extrapolateLeft: 'clamp' as const,
    extrapolateRight: 'clamp' as const,
  };

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  const frames = sorted.map((k) => k.frame);
  const zooms = sorted.map((k) => k.zoom);
  const focusXs = sorted.map((k) => k.focusX);
  const focusYs = sorted.map((k) => k.focusY);

  const zoom = frames.length === 1 ? zooms[0] : interpolate(frame, frames, zooms, clamp);
  const focusX = frames.length === 1 ? focusXs[0] : interpolate(frame, frames, focusXs, clamp);
  const focusY = frames.length === 1 ? focusYs[0] : interpolate(frame, frames, focusYs, clamp);

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
