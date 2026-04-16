import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Camera, type CameraKeyframe } from '@video/components/Camera';
import { Scene } from '@video/components/Scene';
import { Title } from '@video/components/Title';
import { FilmGrain } from '@video/components/FilmGrain';
import { Letterbox } from '@video/components/Letterbox';
import { secondsToFrames } from '@video/lib/timing';
import { fadeIn, fadeOut, springAt, SPRING_SNAPPY } from '@video/lib/animation';
import type { SceneManifest, SceneBeat, Region } from './types';
import '@video/env/fonts.css';

export interface PaintingExplorerProps {
  manifest: SceneManifest;
}

// ---------------------------------------------------------------------------
// Mood → accent color mapping
// ---------------------------------------------------------------------------
const MOOD_COLORS: Record<string, string> = {
  dramatic: '#e74c3c',
  mysterious: '#9b59b6',
  humorous: '#f39c12',
  reverent: '#c9a84c',
  tense: '#e67e22',
  peaceful: '#3498db',
  epic: '#c9a84c',
};

function moodColor(mood: string): string {
  return MOOD_COLORS[mood] ?? '#c9a84c';
}

// ---------------------------------------------------------------------------
// Opening hook: start zoomed on a detail, pull back to reveal
// ---------------------------------------------------------------------------
const HOOK_DURATION_S = 3; // seconds for the zoom-out reveal

function buildKeyframes(manifest: SceneManifest, fps: number): CameraKeyframe[] {
  const keyframes: CameraKeyframe[] = [];
  const hookFrames = secondsToFrames(HOOK_DURATION_S, fps);

  // Hook: find the most "dramatic" or first non-overview region
  const hookRegion = manifest.regions[0];
  if (hookRegion) {
    const fx = hookRegion.bbox.x + hookRegion.bbox.width / 2;
    const fy = hookRegion.bbox.y + hookRegion.bbox.height / 2;
    keyframes.push({ frame: 0, zoom: 3, focusX: fx, focusY: fy });
    keyframes.push({ frame: hookFrames, zoom: 1, focusX: 50, focusY: 50 });
  }

  // Offset all beat keyframes by the hook duration
  let currentFrame = hookFrames;

  for (const beat of manifest.beats) {
    const beatDuration = secondsToFrames(beat.durationSeconds, fps);
    const transition = beat.transition ?? 'pan';

    if (transition === 'pan') {
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
    } else {
      // Hold camera during cuts
      if (keyframes.length > 0) {
        const last = keyframes[keyframes.length - 1];
        keyframes.push({ frame: currentFrame, zoom: last.zoom, focusX: last.focusX, focusY: last.focusY });
      }
    }

    currentFrame += beatDuration;
  }

  return keyframes;
}

// ---------------------------------------------------------------------------
// Black flash between beats (creates rhythm)
// ---------------------------------------------------------------------------
const BLACK_FLASH_FRAMES = 4;

const BlackFlash: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const local = frame - at;
  if (local < 0 || local >= BLACK_FLASH_FRAMES) return null;

  // Peak at frame 1, fade out
  const opacity = local === 0 ? 0.7 : local === 1 ? 1 : interpolate(local, [1, BLACK_FLASH_FRAMES], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', opacity, zIndex: 50 }} />
  );
};

// ---------------------------------------------------------------------------
// Subtitle (for pan beats)
// ---------------------------------------------------------------------------
const Subtitle: React.FC<{ text: string; from: number; duration: number }> = ({
  text,
  from,
  duration,
}) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const enter = fadeIn(local, 0, 15);
  const exit = fadeOut(local, duration - 15, 15);
  const opacity = Math.min(enter, exit);

  // Adjust position for portrait vs landscape
  const isPortrait = height > 1200;
  const bottom = isPortrait ? 200 : 100;

  return (
    <div
      style={{
        position: 'absolute',
        bottom,
        left: '50%',
        transform: 'translateX(-50%)',
        opacity,
        maxWidth: '85%',
        textAlign: 'center',
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(12px)',
          borderRadius: 16,
          padding: '18px 36px',
          fontSize: isPortrait ? 28 : 32,
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 500,
          color: '#fff',
          lineHeight: 1.5,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Spotlight dimming (replaces border-box region highlights)
// ---------------------------------------------------------------------------
const SpotlightDim: React.FC<{
  manifest: SceneManifest;
  beat: SceneBeat;
  from: number;
  duration: number;
}> = ({ manifest, beat, from, duration }) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;
  if (beat.regionId === 'overview') return null;
  if ((beat.transition ?? 'pan') === 'cut') return null;

  const region = manifest.regions.find((r) => r.id === beat.regionId);
  if (!region) return null;

  const enter = fadeIn(local, 0, 20);
  const exit = fadeOut(local, duration - 20, 20);
  const opacity = Math.min(enter, exit) * 0.55;

  // Dim everything except the region using a CSS mask
  const x = region.bbox.x;
  const y = region.bbox.y;
  const w = region.bbox.width;
  const h = region.bbox.height;

  // Inset ellipse that reveals the region
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2 + 3; // slight padding
  const ry = h / 2 + 3;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: `rgba(0, 0, 0, ${opacity})`,
        maskImage: `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, transparent 90%, black 100%)`,
        WebkitMaskImage: `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, transparent 90%, black 100%)`,
        pointerEvents: 'none',
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Cut scene: full-screen crop with text card + accent line
// ---------------------------------------------------------------------------
const CutScene: React.FC<{
  manifest: SceneManifest;
  region: Region;
  beat: SceneBeat;
  from: number;
  duration: number;
}> = ({ manifest, region, beat, from, duration }) => {
  const frame = useCurrentFrame();
  const { width: vpWidth, height: vpHeight, fps } = useVideoConfig();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const isPortrait = vpHeight > vpWidth;

  // Sharp cut in (2 frames), fade out (6 frames)
  const enter = fadeIn(local, 0, 2);
  const exit = fadeOut(local, duration - 6, 6);
  const opacity = Math.min(enter, exit);

  // Subtle drift zoom
  const driftZoom = 1 + local * 0.0004;

  // Region pixel coordinates
  const rx = (region.bbox.x / 100) * manifest.imageWidth;
  const ry = (region.bbox.y / 100) * manifest.imageHeight;
  const rw = (region.bbox.width / 100) * manifest.imageWidth;
  const rh = (region.bbox.height / 100) * manifest.imageHeight;

  // Scale region to fill viewport (cover)
  const scale = Math.max(vpWidth / rw, vpHeight / rh) * driftZoom;

  // Center the region in viewport
  const tx = vpWidth / 2 - (rx + rw / 2) * scale;
  const ty = vpHeight / 2 - (ry + rh / 2) * scale;

  // Text animations
  const accentProgress = springAt(frame, from + 6, fps, SPRING_SNAPPY);
  const textProgress = springAt(frame, from + 10, fps, SPRING_SNAPPY);
  const narrationProgress = springAt(frame, from + 18, fps, SPRING_SNAPPY);

  const accent = moodColor(beat.mood);
  const bottomOffset = isPortrait ? 220 : 100;

  return (
    <AbsoluteFill style={{ opacity, zIndex: 20 }}>
      {/* Cropped region as full-screen background */}
      <div
        style={{
          position: 'absolute',
          width: vpWidth,
          height: vpHeight,
          overflow: 'hidden',
        }}
      >
        <Img
          src={staticFile(manifest.imagePath)}
          style={{
            position: 'absolute',
            width: manifest.imageWidth,
            height: manifest.imageHeight,
            transformOrigin: '0 0',
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            willChange: 'transform',
          }}
        />
      </div>

      {/* Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.65) 100%)',
        }}
      />

      {/* Bottom gradient */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 40%, transparent 100%)',
        }}
      />

      {/* Text card with accent line */}
      <div
        style={{
          position: 'absolute',
          bottom: bottomOffset,
          left: isPortrait ? 40 : 80,
          right: isPortrait ? 40 : 80,
        }}
      >
        {/* Accent line */}
        <div
          style={{
            width: 60 * accentProgress,
            height: 3,
            backgroundColor: accent,
            marginBottom: 16,
            borderRadius: 2,
          }}
        />

        {/* Label */}
        <div
          style={{
            fontSize: isPortrait ? 44 : 52,
            fontWeight: 700,
            fontFamily: 'Montserrat, sans-serif',
            color: '#fff',
            opacity: textProgress,
            transform: `translateY(${20 * (1 - textProgress)}px)`,
            marginBottom: 12,
            textShadow: '0 2px 16px rgba(0,0,0,0.6)',
          }}
        >
          {region.label}
        </div>

        {/* Narration */}
        <div
          style={{
            fontSize: isPortrait ? 24 : 30,
            fontWeight: 400,
            fontFamily: 'Montserrat, sans-serif',
            color: 'rgba(255,255,255,0.9)',
            opacity: narrationProgress,
            transform: `translateY(${14 * (1 - narrationProgress)}px)`,
            lineHeight: 1.5,
            maxWidth: isPortrait ? '100%' : '75%',
            textShadow: '0 1px 8px rgba(0,0,0,0.5)',
          }}
        >
          {beat.narration}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Fade to black ending
// ---------------------------------------------------------------------------
const OUTRO_DURATION_S = 3;

const Outro: React.FC<{
  manifest: SceneManifest;
  from: number;
  duration: number;
}> = ({ manifest, from, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const bgOpacity = fadeIn(local, 0, 20);
  const textProgress = springAt(frame, from + 15, fps, SPRING_SNAPPY);

  return (
    <AbsoluteFill style={{ zIndex: 60 }}>
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: bgOpacity }} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          opacity: textProgress,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 500,
              fontFamily: 'Montserrat, sans-serif',
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: 4,
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            {manifest.artist}
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 600,
              fontFamily: 'Montserrat, sans-serif',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            {manifest.title}
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 400,
              fontFamily: 'Montserrat, sans-serif',
              color: 'rgba(255,255,255,0.4)',
              marginTop: 8,
            }}
          >
            {manifest.year}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Main composition
// ---------------------------------------------------------------------------
export const PaintingExplorer: React.FC<PaintingExplorerProps> = ({ manifest }) => {
  const { fps } = useVideoConfig();

  const hookFrames = secondsToFrames(HOOK_DURATION_S, fps);
  const outroFrames = secondsToFrames(OUTRO_DURATION_S, fps);
  const keyframes = buildKeyframes(manifest, fps);

  // Beat frame offsets (shifted by hook)
  let frameOffset = hookFrames;
  const beatFrames = manifest.beats.map((beat) => {
    const from = frameOffset;
    const duration = secondsToFrames(beat.durationSeconds, fps);
    frameOffset += duration;
    return { beat, from, duration };
  });

  const outroFrom = frameOffset;

  // Black flashes at cut boundaries
  const cutFlashFrames: number[] = [];
  for (const { beat, from } of beatFrames) {
    if ((beat.transition ?? 'pan') === 'cut') {
      cutFlashFrames.push(from - 2); // flash just before the cut
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {/* Camera wraps the painting + spotlight dims */}
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

        {beatFrames.map(({ beat, from, duration }, i) => (
          <SpotlightDim
            key={i}
            manifest={manifest}
            beat={beat}
            from={from}
            duration={duration}
          />
        ))}
      </Camera>

      {/* Cut scenes overlay */}
      {beatFrames.map(({ beat, from, duration }, i) => {
        const transition = beat.transition ?? 'pan';
        if (transition !== 'cut' || beat.regionId === 'overview') return null;

        const region = manifest.regions.find((r) => r.id === beat.regionId);
        if (!region) return null;

        return (
          <CutScene
            key={`cut-${i}`}
            manifest={manifest}
            region={region}
            beat={beat}
            from={from}
            duration={duration}
          />
        );
      })}

      {/* Black flashes at cut transitions */}
      {cutFlashFrames.map((at, i) => (
        <BlackFlash key={`flash-${i}`} at={at} />
      ))}

      {/* Opening hook title card — appears during the zoom-out reveal */}
      <Scene from={0} duration={hookFrames + secondsToFrames(2, fps)} fadeOutDuration={20}>
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 40%, transparent 70%)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <Title
              text={manifest.title}
              fontSize={72}
              startFrame={10}
              color="#fff"
              style={{ justifyContent: 'center', fontFamily: 'Montserrat, sans-serif' }}
            />
            <Title
              text={`${manifest.artist}, ${manifest.year}`}
              fontSize={36}
              fontWeight={400}
              startFrame={25}
              color="rgba(255,255,255,0.7)"
              style={{ justifyContent: 'center', fontFamily: 'Montserrat, sans-serif', marginTop: 16 }}
            />
          </div>
        </AbsoluteFill>
      </Scene>

      {/* Subtitles for pan beats only */}
      {beatFrames.map(({ beat, from, duration }, i) => {
        if ((beat.transition ?? 'pan') === 'cut') return null;
        return <Subtitle key={`sub-${i}`} text={beat.narration} from={from} duration={duration} />;
      })}

      {/* Audio narration per beat (if audioPath exists) */}
      {beatFrames.map(({ beat, from }, i) => {
        if (!beat.audioPath) return null;
        return (
          <Sequence key={`audio-${i}`} from={from}>
            <Audio src={staticFile(beat.audioPath)} volume={1} />
          </Sequence>
        );
      })}

      {/* Outro: fade to black with title */}
      <Outro manifest={manifest} from={outroFrom} duration={outroFrames} />

      {/* Film grain */}
      <FilmGrain opacity={0.05} />

      {/* Letterbox bars (landscape only) */}
      <Letterbox ratio={2.2} />
    </AbsoluteFill>
  );
};
