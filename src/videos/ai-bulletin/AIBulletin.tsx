import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import { Scene } from '@video/components/Scene';
import { FilmGrain } from '@video/components/FilmGrain';
import { secondsToFrames } from '@video/lib/timing';
import { fadeIn, fadeOut, springAt, SPRING_SNAPPY, SPRING_BOUNCY } from '@video/lib/animation';
import { TopBar } from './TopBar';
import { LowerThird } from './LowerThird';
import { Ticker } from './Ticker';
import { BreakingBanner } from './BreakingBanner';
import type { BulletinManifest } from './types';
import { CATEGORY_CONFIG, BRAND } from './types';
import '@video/env/fonts.css';

export interface AIBulletinProps {
  manifest: BulletinManifest;
}

// ---------------------------------------------------------------------------
// Intro — "AI WEEKLY" title card
// ---------------------------------------------------------------------------
const INTRO_DURATION_S = 4;

const Intro: React.FC<{ date: string; storyCount: number; duration: number }> = ({
  date,
  storyCount,
  duration,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isPortrait = height > width;

  const lineEnter = springAt(frame, 8, fps, SPRING_SNAPPY);
  const titleEnter = springAt(frame, 12, fps, SPRING_BOUNCY);
  const subEnter = springAt(frame, 22, fps, SPRING_SNAPPY);
  const countEnter = springAt(frame, 32, fps, SPRING_SNAPPY);
  const exit = fadeOut(frame, duration - 15, 15);

  // Animated background grid
  const gridOffset = frame * 0.3;

  return (
    <AbsoluteFill style={{ opacity: exit, background: BRAND.darkNavy }}>
      {/* Animated grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.06,
          backgroundImage:
            `linear-gradient(${BRAND.red}40 1px, transparent 1px), linear-gradient(90deg, ${BRAND.red}40 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
          backgroundPosition: `${gridOffset}px ${gridOffset}px`,
        }}
      />

      {/* Red glow from center */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 50%, ${BRAND.red}15 0%, transparent 50%)`,
        }}
      />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          {/* Top line */}
          <div
            style={{
              width: 120 * lineEnter,
              height: 3,
              background: `linear-gradient(90deg, ${BRAND.red}, ${BRAND.gold})`,
              margin: '0 auto 20px',
              borderRadius: 2,
            }}
          />

          {/* AI WEEKLY */}
          <div
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 900,
              fontSize: isPortrait ? 64 : 80,
              color: BRAND.white,
              letterSpacing: 12,
              opacity: titleEnter,
              transform: `scale(${0.8 + titleEnter * 0.2})`,
              textShadow: `0 0 40px ${BRAND.red}60`,
            }}
          >
            AI WEEKLY
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 400,
              fontSize: isPortrait ? 20 : 24,
              color: BRAND.gray,
              letterSpacing: 4,
              marginTop: 12,
              opacity: subEnter,
              transform: `translateY(${10 * (1 - subEnter)}px)`,
            }}
          >
            YOUR WEEKLY AI BRIEFING
          </div>

          {/* Story count */}
          <div
            style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: isPortrait ? 16 : 18,
              color: BRAND.red,
              marginTop: 20,
              opacity: countEnter,
              letterSpacing: 1,
            }}
          >
            {storyCount} STORIES THIS WEEK
          </div>

          {/* Bottom line */}
          <div
            style={{
              width: 80 * lineEnter,
              height: 2,
              backgroundColor: BRAND.red,
              margin: '20px auto 0',
              borderRadius: 1,
              opacity: 0.5,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Story thumbnail background
// ---------------------------------------------------------------------------
const StoryBackground: React.FC<{
  thumbnailPath: string | null;
  category: string;
  from: number;
  duration: number;
}> = ({ thumbnailPath, category, from, duration }) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const enter = fadeIn(local, 0, 12);
  const exit = fadeOut(local, duration - 12, 12);
  const opacity = Math.min(enter, exit);

  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG['product'];
  const drift = 1 + local * 0.0002;

  if (!thumbnailPath) {
    // Gradient fallback with category color
    return (
      <AbsoluteFill style={{ opacity: opacity * 0.4 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at 30% 40%, ${config.color}30 0%, ${BRAND.darkNavy} 60%)`,
          }}
        />
      </AbsoluteFill>
    );
  }

  const src = thumbnailPath.startsWith('http') ? thumbnailPath : staticFile(thumbnailPath);

  return (
    <AbsoluteFill style={{ opacity: opacity * 0.3 }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${drift})`,
          filter: 'saturate(0.4) blur(3px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${BRAND.darkNavy}e0 0%, ${BRAND.darkNavy}90 40%, ${BRAND.darkNavy}d0 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Story transition — red wipe
// ---------------------------------------------------------------------------
const StoryWipe: React.FC<{ from: number; color: string }> = ({ from, color }) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < -1 || local >= 8) return null;

  const progress = interpolate(local, [-1, 0, 2, 4, 8], [0, 0.3, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${progress * 100}%`,
        height: '100%',
        background: `linear-gradient(90deg, ${color}00, ${color}40, ${color}00)`,
        zIndex: 70,
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Anchor portrait — static image with subtle animation
// ---------------------------------------------------------------------------
const AnchorPortrait: React.FC<{
  from: number;
  duration: number;
  isPortrait: boolean;
}> = ({ from, duration, isPortrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const enter = springAt(frame, from + 4, fps, SPRING_SNAPPY);
  const exit = fadeOut(local, duration - 8, 8);
  const opacity = Math.min(enter, exit);

  // Subtle breathing animation
  const breathe = 1 + Math.sin(local * 0.04) * 0.008;
  const size = isPortrait ? 280 : 340;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -60%) scale(${breathe})`,
        opacity,
        zIndex: 45,
      }}
    >
      {/* Outer ring */}
      <div
        style={{
          width: size + 8,
          height: size + 8,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${BRAND.red}, ${BRAND.gold})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Inner image */}
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            overflow: 'hidden',
            border: `3px solid ${BRAND.darkNavy}`,
          }}
        >
          <Img
            src={staticFile('assets/anchor/anchor.jpg')}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      </div>

      {/* Name plate */}
      <div
        style={{
          textAlign: 'center',
          marginTop: 8,
          opacity: enter,
        }}
      >
        <div
          style={{
            backgroundColor: BRAND.red,
            display: 'inline-block',
            padding: '3px 12px',
            borderRadius: 3,
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize: 11,
            color: BRAND.white,
            letterSpacing: 2,
          }}
        >
          AI WEEKLY
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Narration text overlay (for when lower third has the headline)
// ---------------------------------------------------------------------------
const NarrationOverlay: React.FC<{
  text: string;
  from: number;
  duration: number;
  isPortrait: boolean;
}> = ({ text, from, duration, isPortrait }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const enter = springAt(frame, from + 20, fps, SPRING_SNAPPY);
  const exit = fadeOut(local, duration - 10, 10);
  const opacity = Math.min(enter, exit);

  return (
    <div
      style={{
        position: 'absolute',
        top: isPortrait ? 140 : 100,
        left: isPortrait ? 24 : 40,
        right: isPortrait ? 24 : 40,
        opacity,
        zIndex: 40,
      }}
    >
      <div
        style={{
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 400,
          fontSize: isPortrait ? 22 : 26,
          color: 'rgba(255,255,255,0.85)',
          lineHeight: 1.6,
          maxWidth: isPortrait ? '100%' : '65%',
          textShadow: '0 1px 8px rgba(0,0,0,0.6)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Outro
// ---------------------------------------------------------------------------
const OUTRO_DURATION_S = 3;

const Outro: React.FC<{ from: number; duration: number }> = ({ from, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const bgOpacity = fadeIn(local, 0, 20);
  const textEnter = springAt(frame, from + 10, fps, SPRING_SNAPPY);
  const lineEnter = springAt(frame, from + 5, fps, SPRING_SNAPPY);

  return (
    <AbsoluteFill style={{ zIndex: 95 }}>
      <AbsoluteFill style={{ backgroundColor: BRAND.darkNavy, opacity: bgOpacity }} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          opacity: textEnter,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 80 * lineEnter,
              height: 2,
              backgroundColor: BRAND.red,
              margin: '0 auto 20px',
            }}
          />
          <div
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 300,
              fontSize: 22,
              color: BRAND.gray,
              letterSpacing: 3,
            }}
          >
            THAT WAS
          </div>
          <div
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 800,
              fontSize: 48,
              color: BRAND.white,
              letterSpacing: 8,
              marginTop: 8,
            }}
          >
            AI WEEKLY
          </div>
          <div
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 400,
              fontSize: 18,
              color: BRAND.gray,
              marginTop: 16,
              letterSpacing: 2,
            }}
          >
            SEE YOU NEXT WEEK
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Main composition
// ---------------------------------------------------------------------------
export const AIBulletin: React.FC<AIBulletinProps> = ({ manifest }) => {
  const { fps, width, height } = useVideoConfig();
  const isPortrait = height > width;

  const introFrames = secondsToFrames(INTRO_DURATION_S, fps);
  const outroFrames = secondsToFrames(OUTRO_DURATION_S, fps);

  // Build beat timeline
  let frameOffset = introFrames;
  const beatTimeline = manifest.beats.map((beat, i) => {
    const from = frameOffset;
    const duration = secondsToFrames(beat.durationSeconds, fps);
    frameOffset += duration;
    return { beat, from, duration, index: i };
  });

  const outroFrom = frameOffset;

  // Collect all headlines for ticker
  const allHeadlines = manifest.beats
    .filter((b) => b.headline)
    .map((b) => b.headline);

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.darkNavy }}>
      {/* Intro */}
      <Sequence from={0} durationInFrames={introFrames}>
        <Intro
          date={manifest.date}
          storyCount={manifest.stories.length}
          duration={introFrames}
        />
      </Sequence>

      {/* Top bar (appears after intro) */}
      <Sequence from={introFrames - 10}>
        <TopBar date={manifest.date} isPortrait={isPortrait} />
      </Sequence>

      {/* Ticker (appears after first story starts) */}
      {beatTimeline.length > 0 && (
        <Ticker
          headlines={allHeadlines}
          startFrame={beatTimeline[0].from + 20}
          isPortrait={isPortrait}
        />
      )}

      {/* Beat scenes */}
      {beatTimeline.map(({ beat, from, duration, index }, beatIdx) => {
        const story = beat.storyIndex >= 0 && beat.storyIndex < manifest.stories.length
          ? manifest.stories[beat.storyIndex]
          : null;

        const config = CATEGORY_CONFIG[beat.category] || CATEGORY_CONFIG['product'];

        return (
          <div key={`beat-${beatIdx}`}>
            {/* Story thumbnail background */}
            <StoryBackground
              thumbnailPath={story?.thumbnailPath || null}
              category={beat.category}
              from={from}
              duration={duration}
            />

            {/* Red wipe transition */}
            <StoryWipe from={from} color={config.color} />

            {/* Breaking banner on first story */}
            {beatIdx === 0 && <BreakingBanner from={from} />}

            {/* Lower third with category + headline */}
            {story && (
              <LowerThird
                category={beat.category}
                headline={beat.headline}
                sentiment={beat.sentiment}
                storySource={story.source}
                from={from}
                duration={duration}
                isPortrait={isPortrait}
              />
            )}

            {/* Anchor portrait */}
            <AnchorPortrait from={from} duration={duration} isPortrait={isPortrait} />

            {/* Narration text */}
            <NarrationOverlay
              text={beat.narration}
              from={from}
              duration={duration}
              isPortrait={isPortrait}
            />
          </div>
        );
      })}

      {/* Audio narration per beat */}
      {beatTimeline.map(({ beat, from }, i) => {
        if (!beat.audioPath) return null;
        return (
          <Sequence key={`audio-${i}`} from={from}>
            <Audio src={staticFile(beat.audioPath)} volume={1} />
          </Sequence>
        );
      })}

      {/* Outro */}
      <Outro from={outroFrom} duration={outroFrames} />

      {/* Film grain — subtle */}
      <FilmGrain opacity={0.03} />
    </AbsoluteFill>
  );
};
