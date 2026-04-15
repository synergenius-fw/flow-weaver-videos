import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Camera, type CameraKeyframe } from '@video/components/Camera';
import { Scene } from '@video/components/Scene';
import { Title } from '@video/components/Title';
import { secondsToFrames } from '@video/lib/timing';
import { fadeIn, fadeOut } from '@video/lib/animation';
import type { SceneManifest, SceneBeat } from './types';
import '@video/env/fonts.css';

export interface PaintingExplorerProps {
  manifest: SceneManifest;
}

/** Convert scene beats to camera keyframes */
function beatsToKeyframes(manifest: SceneManifest, fps: number): CameraKeyframe[] {
  const keyframes: CameraKeyframe[] = [];
  let currentFrame = 0;

  for (const beat of manifest.beats) {
    const beatDuration = secondsToFrames(beat.durationSeconds, fps);

    if (beat.regionId === 'overview') {
      keyframes.push({ frame: currentFrame, zoom: beat.zoom, focusX: 50, focusY: 50 });
    } else {
      const region = manifest.regions.find((r) => r.id === beat.regionId);
      if (region) {
        const focusX = region.bbox.x + region.bbox.width / 2;
        const focusY = region.bbox.y + region.bbox.height / 2;
        keyframes.push({ frame: currentFrame, zoom: beat.zoom, focusX, focusY });
      }
    }

    currentFrame += beatDuration;
  }

  return keyframes;
}

/** Subtitle bar at the bottom of the frame */
const Subtitle: React.FC<{ text: string; from: number; duration: number }> = ({
  text,
  from,
  duration,
}) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const enter = fadeIn(local, 0, 15);
  const exit = fadeOut(local, duration - 15, 15);
  const opacity = Math.min(enter, exit);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        opacity,
        maxWidth: '80%',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          borderRadius: 12,
          padding: '16px 32px',
          fontSize: 32,
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 500,
          color: '#fff',
          lineHeight: 1.4,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Region highlight overlay */
const RegionHighlight: React.FC<{
  manifest: SceneManifest;
  beat: SceneBeat;
  from: number;
  duration: number;
}> = ({ manifest, beat, from, duration }) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;
  if (beat.regionId === 'overview') return null;

  const region = manifest.regions.find((r) => r.id === beat.regionId);
  if (!region) return null;

  const enter = fadeIn(local, 0, 20);
  const exit = fadeOut(local, duration - 20, 20);
  const opacity = Math.min(enter, exit) * 0.4;

  // Convert percentage bbox to pixel position on the content
  const x = (region.bbox.x / 100) * manifest.imageWidth;
  const y = (region.bbox.y / 100) * manifest.imageHeight;
  const w = (region.bbox.width / 100) * manifest.imageWidth;
  const h = (region.bbox.height / 100) * manifest.imageHeight;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        border: '3px solid rgba(255, 255, 255, 0.6)',
        borderRadius: 8,
        boxShadow: '0 0 20px rgba(255, 255, 255, 0.3)',
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};

export const PaintingExplorer: React.FC<PaintingExplorerProps> = ({ manifest }) => {
  const { fps } = useVideoConfig();
  const keyframes = beatsToKeyframes(manifest, fps);

  // Calculate frame offsets for each beat
  let frameOffset = 0;
  const beatFrames = manifest.beats.map((beat) => {
    const from = frameOffset;
    const duration = secondsToFrames(beat.durationSeconds, fps);
    frameOffset += duration;
    return { beat, from, duration };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {/* Camera wraps the painting image + region highlights */}
      <Camera
        keyframes={keyframes}
        contentWidth={manifest.imageWidth}
        contentHeight={manifest.imageHeight}
      >
        <Img
          src={staticFile(manifest.imagePath)}
          style={{
            width: manifest.imageWidth,
            height: manifest.imageHeight,
          }}
        />

        {/* Region highlights rendered in content space (move with camera) */}
        {beatFrames.map(({ beat, from, duration }, i) => (
          <RegionHighlight
            key={i}
            manifest={manifest}
            beat={beat}
            from={from}
            duration={duration}
          />
        ))}
      </Camera>

      {/* Title card at the start */}
      <Scene from={0} duration={secondsToFrames(4, fps)} fadeOutDuration={20}>
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <Title
              text={manifest.title}
              fontSize={72}
              startFrame={15}
              color="#fff"
              style={{ justifyContent: 'center', fontFamily: 'Montserrat, sans-serif' }}
            />
            <Title
              text={`${manifest.artist}, ${manifest.year}`}
              fontSize={36}
              fontWeight={400}
              startFrame={30}
              color="rgba(255,255,255,0.7)"
              style={{ justifyContent: 'center', fontFamily: 'Montserrat, sans-serif', marginTop: 16 }}
            />
          </div>
        </AbsoluteFill>
      </Scene>

      {/* Subtitle narration for each beat */}
      {beatFrames.map(({ beat, from, duration }, i) => (
        <Subtitle key={i} text={beat.narration} from={from} duration={duration} />
      ))}
    </AbsoluteFill>
  );
};
