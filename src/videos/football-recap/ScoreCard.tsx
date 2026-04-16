import { useCurrentFrame, useVideoConfig, Img, staticFile } from 'remotion';

/** Resolve image source: local assets use staticFile(), URLs pass through */
function resolveImg(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return staticFile(src);
}
import { springAt, SPRING_SNAPPY, SPRING_BOUNCY, fadeIn, fadeOut } from '@video/lib/animation';
import type { Match } from './types';

interface ScoreCardProps {
  match: Match;
  index: number;
  from: number;
  duration: number;
  crestImages: Record<string, string>;
  playerImages: Record<string, string>;
  accentColor: string;
  isPortrait: boolean;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({
  match,
  index,
  from,
  duration,
  crestImages,
  playerImages,
  accentColor,
  isPortrait,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - from;
  if (local < 0 || local >= duration) return null;

  const stagger = index * 8;
  const enter = springAt(frame, from + stagger, fps, SPRING_SNAPPY);
  const exit = fadeOut(local, duration - 12, 12);
  const opacity = Math.min(enter, exit);

  const scoreReveal = springAt(frame, from + stagger + 12, fps, SPRING_BOUNCY);
  const isHighlight = match.highlight;

  const cardWidth = isPortrait ? 920 : 800;
  const fontSize = isPortrait ? 28 : 32;
  const crestSize = isPortrait ? 48 : 56;
  const scoreSize = isPortrait ? 52 : 60;

  // Use local crest if available, fall back to API URL
  const homeCrest = crestImages[match.homeTeam.name] || (match.homeTeam.crest || undefined);
  const awayCrest = crestImages[match.awayTeam.name] || (match.awayTeam.crest || undefined);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${30 * (1 - enter)}px)`,
        width: cardWidth,
        margin: '0 auto',
        marginBottom: 12,
      }}
    >
      {/* Card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isHighlight
            ? `linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)`
            : 'rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding: '16px 24px',
          border: isHighlight
            ? `1px solid ${accentColor}40`
            : '1px solid rgba(255,255,255,0.06)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Highlight glow */}
        {isHighlight && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
            }}
          />
        )}

        {/* Home team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flex: 1,
          }}
        >
          {homeCrest && (
            <Img
              src={resolveImg(homeCrest)!}
              style={{ width: crestSize, height: crestSize, objectFit: 'contain' }}
            />
          )}
          <div
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 600,
              fontSize,
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: isPortrait ? 260 : 220,
            }}
          >
            {match.homeTeam.name}
          </div>
        </div>

        {/* Score */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '0 16px',
            opacity: scoreReveal,
            transform: `scale(${0.5 + scoreReveal * 0.5})`,
          }}
        >
          <span
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize: scoreSize,
              color: '#fff',
              minWidth: 40,
              textAlign: 'right',
            }}
          >
            {match.homeTeam.score}
          </span>
          <span
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 300,
              fontSize: scoreSize * 0.6,
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            :
          </span>
          <span
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize: scoreSize,
              color: '#fff',
              minWidth: 40,
              textAlign: 'left',
            }}
          >
            {match.awayTeam.score}
          </span>
        </div>

        {/* Away team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flex: 1,
            justifyContent: 'flex-end',
          }}
        >
          <div
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 600,
              fontSize,
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: isPortrait ? 260 : 220,
              textAlign: 'right',
            }}
          >
            {match.awayTeam.name}
          </div>
          {awayCrest && (
            <Img
              src={resolveImg(awayCrest)!}
              style={{ width: crestSize, height: crestSize, objectFit: 'contain' }}
            />
          )}
        </div>
      </div>

      {/* Scorers row with player photos */}
      {match.scorers.length > 0 && (
        <div
          style={{
            opacity: fadeIn(local - stagger, 15, 10),
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            marginTop: 8,
            flexWrap: 'wrap',
          }}
        >
          {match.scorers.map((s, si) => {
            const photo = playerImages[s.player];
            return (
              <div
                key={si}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {photo && (
                  <Img
                    src={resolveImg(photo)!}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      objectFit: 'cover',
                      border: '1px solid rgba(255,255,255,0.2)',
                    }}
                  />
                )}
                <span
                  style={{
                    fontFamily: 'DM Mono, monospace',
                    fontSize: isPortrait ? 15 : 17,
                    color: 'rgba(255,255,255,0.5)',
                    letterSpacing: 0.3,
                  }}
                >
                  {s.player} {s.minute}'
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
