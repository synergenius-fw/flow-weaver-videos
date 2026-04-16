import { useCurrentFrame, useVideoConfig } from 'remotion';
import { springAt, SPRING_SNAPPY, fadeOut } from '@video/lib/animation';
import { CATEGORY_CONFIG, SENTIMENT_COLORS, BRAND } from './types';

interface LowerThirdProps {
  category: string;
  headline: string;
  sentiment: string;
  storySource: string;
  from: number;
  duration: number;
  isPortrait: boolean;
}

export const LowerThird: React.FC<LowerThirdProps> = ({
  category,
  headline,
  sentiment,
  storySource,
  from,
  duration,
  isPortrait,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG['product'];
  const sentimentColor = SENTIMENT_COLORS[sentiment] || SENTIMENT_COLORS['neutral'];

  // Animations
  const redBarEnter = springAt(frame, from + 2, fps, SPRING_SNAPPY);
  const categoryEnter = springAt(frame, from + 6, fps, SPRING_SNAPPY);
  const headlineEnter = springAt(frame, from + 10, fps, SPRING_SNAPPY);
  const sourceEnter = springAt(frame, from + 16, fps, SPRING_SNAPPY);
  const exit = fadeOut(local, duration - 10, 10);

  const bottom = isPortrait ? 240 : 120;
  const headlineFontSize = isPortrait ? 28 : 36;

  return (
    <div
      style={{
        position: 'absolute',
        bottom,
        left: 0,
        right: 0,
        opacity: exit,
        zIndex: 50,
      }}
    >
      {/* Red accent bar */}
      <div
        style={{
          width: `${redBarEnter * 100}%`,
          height: 3,
          backgroundColor: BRAND.red,
          marginBottom: 0,
        }}
      />

      {/* Main lower third container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(90deg, ${BRAND.darkNavy}f0 0%, ${BRAND.navy}d0 70%, transparent 100%)`,
          padding: isPortrait ? '12px 24px' : '14px 32px',
        }}
      >
        {/* Category pill + sentiment dot */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            opacity: categoryEnter,
            transform: `translateX(${-40 * (1 - categoryEnter)}px)`,
          }}
        >
          <div
            style={{
              backgroundColor: config.color,
              borderRadius: 4,
              padding: '3px 10px',
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize: isPortrait ? 12 : 14,
              color: '#fff',
              letterSpacing: 2,
            }}
          >
            {config.label}
          </div>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: sentimentColor,
              boxShadow: `0 0 6px ${sentimentColor}`,
            }}
          />
        </div>

        {/* Headline */}
        <div
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize: headlineFontSize,
            color: BRAND.white,
            marginTop: 6,
            opacity: headlineEnter,
            transform: `translateX(${-30 * (1 - headlineEnter)}px)`,
            lineHeight: 1.2,
            maxWidth: isPortrait ? '90%' : '70%',
          }}
        >
          {headline}
        </div>

        {/* Source */}
        <div
          style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: isPortrait ? 12 : 14,
            color: BRAND.gray,
            marginTop: 4,
            opacity: sourceEnter,
            letterSpacing: 1,
          }}
        >
          SOURCE: {storySource.toUpperCase()}
        </div>
      </div>

      {/* Bottom accent line */}
      <div
        style={{
          width: `${redBarEnter * 60}%`,
          height: 2,
          backgroundColor: config.color,
          opacity: 0.6,
        }}
      />
    </div>
  );
};
