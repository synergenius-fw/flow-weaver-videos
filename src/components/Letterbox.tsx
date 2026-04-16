import { useVideoConfig } from 'remotion';

/**
 * Cinematic letterbox bars. Crops to a wider aspect ratio (default 2.35:1).
 * Only renders bars if the composition is wider than it is tall.
 */
export const Letterbox: React.FC<{ ratio?: number }> = ({ ratio = 2.35 }) => {
  const { width, height } = useVideoConfig();

  // Only apply letterbox to landscape compositions
  if (width <= height) return null;

  const currentRatio = width / height;
  if (currentRatio >= ratio) return null;

  const targetHeight = width / ratio;
  const barHeight = (height - targetHeight) / 2;

  if (barHeight <= 0) return null;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: barHeight,
          backgroundColor: '#000',
          zIndex: 100,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: barHeight,
          backgroundColor: '#000',
          zIndex: 100,
        }}
      />
    </>
  );
};
