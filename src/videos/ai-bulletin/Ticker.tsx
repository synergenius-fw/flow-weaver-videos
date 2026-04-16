import { useCurrentFrame, useVideoConfig } from 'remotion';
import { fadeIn } from '@video/lib/animation';
import { BRAND } from './types';

interface TickerProps {
  headlines: string[];
  startFrame: number;
  isPortrait: boolean;
}

export const Ticker: React.FC<TickerProps> = ({ headlines, startFrame, isPortrait }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const local = frame - startFrame;
  if (local < 0) return null;

  const enter = fadeIn(local, 0, 20);
  const text = headlines.join('    ▸    ');
  // Repeat text enough times to scroll continuously
  const repeated = `${text}    ▸    ${text}    ▸    ${text}`;

  // Scroll speed: 2 pixels per frame
  const scrollX = -(local * 2) % (text.length * 9);

  const bottom = isPortrait ? 180 : 60;
  const height = isPortrait ? 36 : 32;
  const fontSize = isPortrait ? 14 : 15;

  return (
    <div
      style={{
        position: 'absolute',
        bottom,
        left: 0,
        right: 0,
        height,
        opacity: enter,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        background: `${BRAND.darkNavy}e0`,
        borderTop: `1px solid ${BRAND.red}40`,
        borderBottom: `1px solid ${BRAND.red}40`,
        zIndex: 80,
      }}
    >
      {/* BREAKING tag */}
      <div
        style={{
          backgroundColor: BRAND.red,
          padding: '0 12px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 800,
          fontSize,
          color: BRAND.white,
          letterSpacing: 2,
          flexShrink: 0,
          zIndex: 1,
        }}
      >
        HEADLINES
      </div>

      {/* Scrolling text */}
      <div
        style={{
          whiteSpace: 'nowrap',
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 500,
          fontSize,
          color: BRAND.lightGray,
          letterSpacing: 0.5,
          transform: `translateX(${scrollX}px)`,
          paddingLeft: 16,
        }}
      >
        {repeated}
      </div>
    </div>
  );
};
