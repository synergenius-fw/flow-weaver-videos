/**
 * Painting Explorer — Manifest Generator
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx src/workflows/painting-explorer/generate.ts <image-path>
 *
 * This script:
 *   1. Reads a painting image
 *   2. Sends it to Claude Vision to identify regions of interest
 *   3. Asks Claude to generate a narrative story mapped to those regions
 *   4. Outputs a scene manifest JSON that Remotion can render
 */

import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const client = new Anthropic();

async function analyzeImage(imagePath: string) {
  const absolutePath = path.resolve(imagePath);
  const imageBuffer = fs.readFileSync(absolutePath);
  const metadata = await sharp(absolutePath).metadata();

  const width = metadata.width!;
  const height = metadata.height!;

  // Resize if too large for the API (max ~5MB base64)
  let sendBuffer = imageBuffer;
  if (imageBuffer.length > 3_000_000) {
    sendBuffer = await sharp(absolutePath)
      .resize({ width: Math.min(width, 2400), withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  const base64 = sendBuffer.toString('base64');
  const mediaType = absolutePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  console.log(`Analyzing image: ${absolutePath} (${width}x${height})`);

  // Step 1: Identify regions of interest
  const regionResponse = await client.messages.create({
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Analyze this painting and identify 4-8 regions of interest (people, groups, objects, architectural elements).

For each region, provide:
- id: a kebab-case identifier
- label: short human-readable name
- description: 1-2 sentences about what's depicted and its significance
- bbox: bounding box as percentage of image dimensions (x, y, width, height) where x,y is the top-left corner. Values should be 0-100.

Return ONLY valid JSON in this format:
{
  "title": "Painting Title",
  "artist": "Artist Name",
  "year": "Year or period",
  "regions": [
    { "id": "region-name", "label": "Region Label", "description": "...", "bbox": { "x": 10, "y": 20, "width": 30, "height": 40 } }
  ]
}`,
          },
        ],
      },
    ],
  });

  const regionText = regionResponse.content[0].type === 'text' ? regionResponse.content[0].text : '';
  const regionData = JSON.parse(regionText.replace(/```json\n?|\n?```/g, ''));

  console.log(`Found ${regionData.regions.length} regions: ${regionData.regions.map((r: { label: string }) => r.label).join(', ')}`);

  // Step 2: Generate narrative story mapped to regions
  const storyResponse = await client.messages.create({
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `You are creating a narrated video that explores this painting: "${regionData.title}" by ${regionData.artist} (${regionData.year}).

The video will pan and zoom across the painting, stopping at regions of interest. Here are the detected regions:

${JSON.stringify(regionData.regions, null, 2)}

Create a compelling 30-40 second narrative as a sequence of "beats". Each beat focuses on one region or gives an overview.

Rules:
- Start with an "overview" beat that introduces the painting (use regionId: "overview")
- End with an "overview" beat that wraps up the story
- Each beat should be 4-6 seconds
- Narration should be punchy, engaging, slightly dramatic — like a short-form documentary
- Zoom: use 1 for overview, 2-3 for focused regions
- Mood: one of "dramatic", "mysterious", "humorous", "reverent", "tense", "peaceful", "epic"
- Total should be 6-8 beats

Return ONLY valid JSON:
{
  "beats": [
    { "regionId": "overview", "narration": "...", "durationSeconds": 5, "zoom": 1, "mood": "epic" }
  ]
}`,
          },
        ],
      },
    ],
  });

  const storyText = storyResponse.content[0].type === 'text' ? storyResponse.content[0].text : '';
  const storyData = JSON.parse(storyText.replace(/```json\n?|\n?```/g, ''));

  console.log(`Generated ${storyData.beats.length} story beats`);

  // Step 3: Assemble the manifest
  const totalDurationSeconds = storyData.beats.reduce(
    (sum: number, b: { durationSeconds: number }) => sum + b.durationSeconds,
    0,
  );

  // Copy image to public directory
  const ext = path.extname(absolutePath);
  const imageFileName = `images/${path.basename(absolutePath, ext)}${ext}`;
  const destPath = path.resolve('public', imageFileName);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(absolutePath, destPath);

  const manifest = {
    title: regionData.title,
    artist: regionData.artist,
    year: regionData.year,
    imagePath: imageFileName,
    imageWidth: width,
    imageHeight: height,
    regions: regionData.regions,
    beats: storyData.beats,
    totalDurationSeconds,
  };

  // Write manifest
  const outPath = path.resolve('src/videos/painting-explorer/manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to ${outPath}`);
  console.log(`Total duration: ${totalDurationSeconds}s (${storyData.beats.length} beats)`);
  console.log(`\nRun "npm run studio" to preview in Remotion Studio`);
}

// CLI entry point
const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: npx tsx src/workflows/painting-explorer/generate.ts <image-path>');
  process.exit(1);
}

analyzeImage(imagePath).catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
