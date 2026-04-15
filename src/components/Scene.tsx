import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeIn, fadeOut, slideInY } from '@video/lib/animation';

export interface SceneProps {
  from: number;
  duration: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  slideIn?: boolean;
  backgroundColor?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export const Scene: React.FC<SceneProps> = ({
  from,
  duration,
  fadeInDuration = 10,
  fadeOutDuration = 10,
  slideIn = false,
  backgroundColor,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;

  if (local < 0 || local >= duration) return null;

  const enterOpacity = fadeIn(local, 0, fadeInDuration);
  const exitOpacity = fadeOut(local, duration - fadeOutDuration, fadeOutDuration);
  const opacity = Math.min(enterOpacity, exitOpacity);

  const translateY = slideIn ? slideInY(frame, from, fps) : 0;

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: translateY !== 0 ? `translateY(${translateY}px)` : undefined,
        backgroundColor,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
