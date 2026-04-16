import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import { Scene } from '@video/components/Scene';
import { Title } from '@video/components/Title';
import { FilmGrain } from '@video/components/FilmGrain';
import { secondsToFrames } from '@video/lib/timing';
import { fadeIn, fadeOut, springAt, SPRING_SNAPPY } from '@video/lib/animation';
import { ScoreCard } from './ScoreCard';
import { LeagueHeader } from './LeagueHeader';
import type { RecapManifest, Competition, Beat, LEAGUE_COLORS as LC } from './types';
import { LEAGUE_COLORS, MOOD_COLORS } from './types';
import '@video/env/fonts.css';

export interface FootballRecapProps {
  manifest: RecapManifest;
}

// ---------------------------------------------------------------------------
// Intro — date + "MATCHDAY RECAP" branding
// ---------------------------------------------------------------------------
const INTRO_DURATION_S = 5;

const Intro: React.FC<{
  date: string;
  totalMatches: number;
  duration: number;
}> = ({ date, totalMatches, duration }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isPortrait = height > width;

  const bgPulse = 0.3 + Math.sin(frame * 0.03) * 0.1;

  const lineProgress = springAt(frame, 10, fps, SPRING_SNAPPY);
  const titleProgress = springAt(frame, 15, fps, SPRING_SNAPPY);
  const dateProgress = springAt(frame, 25, fps, SPRING_SNAPPY);
  const countProgress = springAt(frame, 35, fps, SPRING_SNAPPY);
  const exit = fadeOut(frame, duration - 15, 15);

  // Format date nicely
  const d = new Date(date + 'T00:00:00');
  const formatted = d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <AbsoluteFill
      style={{
        opacity: exit,
        justifyContent: 'center',
        alignItems: 'center',
        background: '#0a0a0a',
      }}
    >
      {/* Animated gradient background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 40%, rgba(61,25,91,${bgPulse}) 0%, transparent 60%)`,
        }}
      />

      {/* Grid lines (subtle) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.04,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div style={{ textAlign: 'center', zIndex: 1 }}>
        {/* Accent line */}
        <div
          style={{
            width: 100 * lineProgress,
            height: 3,
            background: 'linear-gradient(90deg, #00ff85, #3d195b)',
            margin: '0 auto 24px',
            borderRadius: 2,
          }}
        />

        {/* MATCHDAY RECAP */}
        <div
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize: isPortrait ? 52 : 64,
            color: '#fff',
            letterSpacing: 8,
            textTransform: 'uppercase',
            opacity: titleProgress,
            transform: `translateY(${20 * (1 - titleProgress)}px)`,
          }}
        >
          MATCHDAY RECAP
        </div>

        {/* Date */}
        <div
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 400,
            fontSize: isPortrait ? 24 : 28,
            color: 'rgba(255,255,255,0.6)',
            marginTop: 16,
            opacity: dateProgress,
            transform: `translateY(${12 * (1 - dateProgress)}px)`,
            letterSpacing: 2,
          }}
        >
          {formatted}
        </div>

        {/* Match count */}
        <div
          style={{
            fontFamily: 'DM Mono, monospace',
            fontWeight: 500,
            fontSize: isPortrait ? 18 : 20,
            color: '#00ff85',
            marginTop: 20,
            opacity: countProgress,
            letterSpacing: 1,
          }}
        >
          {totalMatches} MATCHES
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Outro — closing card
// ---------------------------------------------------------------------------
const OUTRO_DURATION_S = 3;

const Outro: React.FC<{
  date: string;
  from: number;
  duration: number;
}> = ({ date, from, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const bgOpacity = fadeIn(local, 0, 20);
  const textProgress = springAt(frame, from + 10, fps, SPRING_SNAPPY);

  return (
    <AbsoluteFill style={{ zIndex: 60 }}>
      <AbsoluteFill style={{ backgroundColor: '#0a0a0a', opacity: bgOpacity }} />
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
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 300,
              fontSize: 20,
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: 4,
              textTransform: 'uppercase',
            }}
          >
            That's the recap
          </div>
          <div
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize: 36,
              color: 'rgba(255,255,255,0.7)',
              marginTop: 12,
            }}
          >
            See you tomorrow
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Narration bar (bottom text)
// ---------------------------------------------------------------------------
const NarrationBar: React.FC<{
  text: string;
  mood: string;
  from: number;
  duration: number;
  isPortrait: boolean;
}> = ({ text, mood, from, duration, isPortrait }) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const enter = fadeIn(local, 0, 12);
  const exit = fadeOut(local, duration - 12, 12);
  const opacity = Math.min(enter, exit);

  const moodColor = MOOD_COLORS[mood] || '#888';
  const bottom = isPortrait ? 200 : 80;

  return (
    <div
      style={{
        position: 'absolute',
        bottom,
        left: '50%',
        transform: 'translateX(-50%)',
        opacity,
        maxWidth: '90%',
        textAlign: 'center',
        zIndex: 40,
      }}
    >
      {/* Mood indicator dot */}
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: moodColor,
          margin: '0 auto 10px',
          boxShadow: `0 0 12px ${moodColor}80`,
        }}
      />
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(16px)',
          borderRadius: 14,
          padding: '16px 32px',
          fontSize: isPortrait ? 24 : 28,
          fontFamily: 'Montserrat, sans-serif',
          fontWeight: 500,
          color: '#fff',
          lineHeight: 1.5,
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Video clip background (plays behind score cards)
// ---------------------------------------------------------------------------
const ClipBackgroundInner: React.FC<{
  clipPath: string;
  duration: number;
}> = ({ clipPath, duration }) => {
  const frame = useCurrentFrame();

  const enter = fadeIn(frame, 0, 8);
  const exit = fadeOut(frame, duration - 8, 8);
  const opacity = Math.min(enter, exit) * 0.4;

  return (
    <AbsoluteFill style={{ opacity }}>
      <OffthreadVideo
        src={staticFile(clipPath)}
        loop
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'saturate(0.7)',
        }}
        muted
      />
      {/* Dark overlay for readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.7) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Stadium image fallback background (when no clip available)
// ---------------------------------------------------------------------------
const StadiumBackground: React.FC<{
  imagePath: string;
  from: number;
  duration: number;
}> = ({ imagePath, from, duration }) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const enter = fadeIn(local, 0, 15);
  const exit = fadeOut(local, duration - 15, 15);
  const opacity = Math.min(enter, exit) * 0.3;

  // Subtle slow zoom for Ken Burns effect
  const scale = 1 + local * 0.0002;

  const src = imagePath.startsWith('http') ? imagePath : staticFile(imagePath);

  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
          filter: 'saturate(0.5) blur(2px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.8) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// League transition wipe
// ---------------------------------------------------------------------------
const LeagueWipe: React.FC<{
  color: string;
  from: number;
}> = ({ color, from }) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < -2 || local >= 6) return null;

  const progress = interpolate(local, [-2, 0, 3, 6], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color,
        opacity: progress * 0.15,
        zIndex: 30,
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Main composition
// ---------------------------------------------------------------------------
export const FootballRecap: React.FC<FootballRecapProps> = ({ manifest }) => {
  const { fps, width, height } = useVideoConfig();
  const isPortrait = height > width;

  const introFrames = secondsToFrames(INTRO_DURATION_S, fps);
  const outroFrames = secondsToFrames(OUTRO_DURATION_S, fps);

  // Build beat timeline
  let frameOffset = introFrames;
  const beatTimeline = manifest.beats.map((beat) => {
    const from = frameOffset;
    const duration = secondsToFrames(beat.durationSeconds, fps);
    frameOffset += duration;
    return { beat, from, duration };
  });

  const outroFrom = frameOffset;

  // Group beats by competition to know which matches to show
  let lastCompId = '';
  const wipeFrames: { frame: number; color: string }[] = [];

  for (const { beat, from } of beatTimeline) {
    if (beat.competitionId !== lastCompId) {
      const colors = LEAGUE_COLORS[beat.competitionId] || { primary: '#333', secondary: '#fff' };
      wipeFrames.push({ frame: from, color: colors.primary });
      lastCompId = beat.competitionId;
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {/* Background texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.03,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      {/* Intro */}
      <Sequence from={0} durationInFrames={introFrames}>
        <Intro
          date={manifest.date}
          totalMatches={manifest.competitions.reduce((s, c) => s + c.matches.length, 0)}
          duration={introFrames}
        />
      </Sequence>

      {/* League wipe transitions */}
      {wipeFrames.map((w, i) => (
        <LeagueWipe key={`wipe-${i}`} color={w.color} from={w.frame} />
      ))}

      {/* Beat scenes — league header + score cards + narration */}
      {beatTimeline.map(({ beat, from, duration }, beatIdx) => {
        const comp = manifest.competitions.find((c) => c.id === beat.competitionId);
        if (!comp) return null;

        const colors = LEAGUE_COLORS[beat.competitionId] || { primary: '#333', secondary: '#fff' };

        // Show league header if this is the first beat for this competition
        const isFirstBeatForComp =
          beatIdx === 0 ||
          beatTimeline[beatIdx - 1].beat.competitionId !== beat.competitionId;

        // Rotate clips: each beat in a competition uses a different match's clip
        const beatsForThisComp = beatTimeline.filter((b) => b.beat.competitionId === beat.competitionId);
        const beatIndexInComp = beatsForThisComp.findIndex((b) => b.from === from);
        const matchesWithClips = comp.matches.filter((m) => {
          const k = `${m.homeTeam.name} vs ${m.awayTeam.name}`;
          return manifest.matchClips?.[k];
        });
        const clipMatch = matchesWithClips.length > 0
          ? matchesWithClips[beatIndexInComp % matchesWithClips.length]
          : null;
        const clipKey = clipMatch
          ? `${clipMatch.homeTeam.name} vs ${clipMatch.awayTeam.name}`
          : '';
        const clipPath = clipKey ? manifest.matchClips?.[clipKey] : undefined;

        return (
          <div key={`beat-${beatIdx}`}>
            {/* Video clip background or stadium fallback */}
            {clipPath ? (
              <Sequence from={from} durationInFrames={duration}>
                <ClipBackgroundInner clipPath={clipPath} duration={duration} />
              </Sequence>
            ) : manifest.stadiumImages?.[beat.competitionId] ? (
              <StadiumBackground
                imagePath={manifest.stadiumImages[beat.competitionId]}
                from={from}
                duration={duration}
              />
            ) : null}

            {/* League header */}
            {isFirstBeatForComp && (
              <LeagueHeader
                name={comp.name}
                color={colors.primary}
                secondaryColor={colors.secondary}
                from={from}
                duration={duration}
                isPortrait={isPortrait}
              />
            )}

            {/* Background gradient for this league */}
            <Scene from={from} duration={duration} fadeInDuration={8} fadeOutDuration={8}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `linear-gradient(180deg, ${colors.primary}15 0%, transparent 40%, transparent 70%, ${colors.primary}10 100%)`,
                }}
              />
            </Scene>

            {/* Score cards */}
            <Scene from={from} duration={duration} fadeInDuration={6} fadeOutDuration={6}>
              <div
                style={{
                  position: 'absolute',
                  top: isPortrait ? 200 : 160,
                  left: 0,
                  right: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {comp.matches.slice(0, isPortrait ? 6 : 4).map((match, matchIdx) => (
                  <ScoreCard
                    key={`card-${beatIdx}-${matchIdx}`}
                    match={match}
                    index={matchIdx}
                    from={from}
                    duration={duration}
                    crestImages={manifest.crestImages}
                    playerImages={manifest.playerImages}
                    accentColor={colors.secondary}
                    isPortrait={isPortrait}
                  />
                ))}
              </div>
            </Scene>

            {/* Narration */}
            <NarrationBar
              text={beat.narration}
              mood={beat.mood}
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
      <Outro date={manifest.date} from={outroFrom} duration={outroFrames} />

      {/* Film grain */}
      <FilmGrain opacity={0.04} />
    </AbsoluteFill>
  );
};
