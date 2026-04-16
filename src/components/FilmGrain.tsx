import { useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Animated film grain overlay using CSS noise.
 * Shifts position every frame to simulate real grain.
 */
export const FilmGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.06 }) => {
  const frame = useCurrentFrame();

  // Pseudo-random offset per frame for grain movement
  const offsetX = ((frame * 73) % 200) - 100;
  const offsetY = ((frame * 137) % 200) - 100;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '256px 256px',
        backgroundPosition: `${offsetX}px ${offsetY}px`,
      }}
    />
  );
};
