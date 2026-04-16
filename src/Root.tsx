import { Composition, registerRoot } from 'remotion';
import { PaintingExplorer } from '@video/videos/painting-explorer/PaintingExplorer';
import { FootballRecap } from '@video/videos/football-recap/FootballRecap';
import { AIBulletin } from '@video/videos/ai-bulletin/AIBulletin';
import type { SceneManifest } from '@video/videos/painting-explorer/types';
import type { RecapManifest } from '@video/videos/football-recap/types';
import type { BulletinManifest } from '@video/videos/ai-bulletin/types';

import paintingManifest from '@video/videos/painting-explorer/sample-manifest.json';
import recapManifest from '@video/videos/football-recap/sample-manifest.json';
import bulletinManifest from '@video/videos/ai-bulletin/sample-manifest.json';

const painting = paintingManifest as SceneManifest;
const recap = recapManifest as RecapManifest;
const bulletin = bulletinManifest as BulletinManifest;

const FPS = 30;

const RemotionRoot: React.FC = () => {
  const paintingFrames = Math.round((painting.totalDurationSeconds + 6) * FPS);
  const recapFrames = Math.round(recap.totalDurationSeconds * FPS);
  const bulletinFrames = Math.round(bulletin.totalDurationSeconds * FPS);

  return (
    <>
      {/* ===== Painting Explorer ===== */}
      <Composition
        id="painting-explorer"
        component={PaintingExplorer}
        durationInFrames={paintingFrames}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ manifest: painting }}
      />
      <Composition
        id="painting-explorer-mobile"
        component={PaintingExplorer}
        durationInFrames={paintingFrames}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ manifest: painting }}
      />

      {/* ===== Football Recap ===== */}
      <Composition
        id="football-recap"
        component={FootballRecap}
        durationInFrames={recapFrames}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ manifest: recap }}
      />
      <Composition
        id="football-recap-mobile"
        component={FootballRecap}
        durationInFrames={recapFrames}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ manifest: recap }}
      />

      {/* ===== AI Weekly Bulletin ===== */}
      <Composition
        id="ai-bulletin"
        component={AIBulletin}
        durationInFrames={bulletinFrames}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ manifest: bulletin }}
      />
      <Composition
        id="ai-bulletin-mobile"
        component={AIBulletin}
        durationInFrames={bulletinFrames}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ manifest: bulletin }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
