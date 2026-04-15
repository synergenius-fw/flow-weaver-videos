import type { CSSProperties } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { springAt, SPRING_SNAPPY } from '@video/lib/animation';

export interface TitleProps {
  text: string;
  startFrame?: number;
  stagger?: number;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  style?: CSSProperties;
}

export const Title: React.FC<TitleProps> = ({
  text,
  startFrame = 0,
  stagger = 3,
  fontSize = 56,
  fontWeight = 700,
  color = '#fff',
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ');

  return (
    <div
      style={{
        fontSize,
        fontWeight,
        color,
        lineHeight: 1.2,
        display: 'flex',
        flexWrap: 'wrap',
        gap: `0 ${fontSize * 0.25}px`,
        ...style,
      }}
    >
      {words.map((word, i) => {
        const wordStart = startFrame + i * stagger;
        const progress = springAt(frame, wordStart, fps, SPRING_SNAPPY);

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: progress,
              transform: `translateY(${20 * (1 - progress)}px)`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
