import { Composition, registerRoot } from 'remotion';
import { PaintingExplorer } from '@video/videos/painting-explorer/PaintingExplorer';
import type { SceneManifest } from '@video/videos/painting-explorer/types';

import sampleManifest from '@video/videos/painting-explorer/sample-manifest.json';

const manifestData = sampleManifest as SceneManifest;

const FPS = 30;

const RemotionRoot: React.FC = () => {
  const manifest = manifestData;
  const totalFrames = Math.round(manifest.totalDurationSeconds * FPS);

  return (
    <>
      {/* Landscape (YouTube, desktop) */}
      <Composition
        id="painting-explorer"
        component={PaintingExplorer}
        durationInFrames={totalFrames}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ manifest }}
      />

      {/* Portrait (Reels, TikTok, Stories) */}
      <Composition
        id="painting-explorer-mobile"
        component={PaintingExplorer}
        durationInFrames={totalFrames}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ manifest }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
