import { useCurrentFrame, useVideoConfig } from 'remotion';
import { springAt, SPRING_SNAPPY } from '@video/lib/animation';
import { BRAND } from './types';

interface TopBarProps {
  date: string;
  isPortrait: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ date, isPortrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = springAt(frame, 5, fps, SPRING_SNAPPY);
  const livePulse = Math.sin(frame * 0.1) > 0 ? 1 : 0.4;

  const d = new Date(date + 'T00:00:00');
  const formatted = d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).toUpperCase();

  const height = isPortrait ? 56 : 48;
  const fontSize = isPortrait ? 16 : 18;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height,
        opacity: enter,
        transform: `translateY(${-height * (1 - enter)}px)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: `linear-gradient(90deg, ${BRAND.darkNavy} 0%, ${BRAND.navy}ee 100%)`,
        borderBottom: `2px solid ${BRAND.red}`,
        zIndex: 90,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize: fontSize + 4,
            color: BRAND.white,
            letterSpacing: 3,
          }}
        >
          AI WEEKLY
        </div>
        <div
          style={{
            width: 2,
            height: 20,
            background: BRAND.red,
          }}
        />
        <div
          style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: fontSize - 2,
            color: BRAND.gray,
            letterSpacing: 1,
          }}
        >
          YOUR WEEKLY AI BRIEFING
        </div>
      </div>

      {/* Right: LIVE + Date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: BRAND.red,
              opacity: livePulse,
              boxShadow: `0 0 8px ${BRAND.red}`,
            }}
          />
          <span
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize: fontSize - 2,
              color: BRAND.red,
              letterSpacing: 2,
            }}
          >
            LIVE
          </span>
        </div>
        <span
          style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: fontSize - 2,
            color: BRAND.lightGray,
            letterSpacing: 1,
          }}
        >
          {formatted}
        </span>
      </div>
    </div>
  );
};
