import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { springAt, SPRING_SNAPPY } from '@video/lib/animation';
import { BRAND } from './types';

interface BreakingBannerProps {
  from: number;
}

export const BreakingBanner: React.FC<BreakingBannerProps> = ({ from }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const local = frame - from;

  // Only show for 30 frames (1 second)
  if (local < 0 || local >= 30) return null;

  const enter = springAt(frame, from, fps, SPRING_SNAPPY);
  const flash = interpolate(local, [0, 5, 10, 15, 20, 25, 30], [1, 0.6, 1, 0.6, 1, 0.8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${0.8 + enter * 0.2})`,
        opacity: flash,
        zIndex: 100,
      }}
    >
      <div
        style={{
          backgroundColor: BRAND.red,
          padding: '12px 48px',
          borderRadius: 4,
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 900,
          fontSize: 48,
          color: BRAND.white,
          letterSpacing: 8,
          textShadow: `0 0 20px ${BRAND.red}`,
        }}
      >
        BREAKING
      </div>
    </div>
  );
};
