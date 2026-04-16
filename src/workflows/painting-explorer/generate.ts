/**
 * Painting Explorer — Manifest Generator
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx src/workflows/painting-explorer/generate.ts <image-path>
 *
 * Pipeline:
 *   1. OWL-ViT detects regions of interest (people, objects) with precise bounding boxes
 *   2. Claude Vision receives the image + detected boxes → identifies each figure, adds context
 *   3. Claude generates a narrative story mapped to those identified regions
 *   4. Outputs a scene manifest JSON that Remotion can render
 */

import Anthropic from '@anthropic-ai/sdk';
import { pipeline } from '@huggingface/transformers';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const client = new Anthropic();

// ---------------------------------------------------------------------------
// Step 1: OWL-ViT detection — precise bounding boxes
// ---------------------------------------------------------------------------
async function detectRegions(imagePath: string) {
  const absolutePath = path.resolve(imagePath);
  const metadata = await sharp(absolutePath).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  console.log(`[1/3] Running OWL-ViT detection on ${absolutePath} (${width}x${height})...`);

  const detector = await pipeline(
    'zero-shot-object-detection',
    'Xenova/owlvit-base-patch32',
  );

  // Broad prompts to catch different types of subjects in paintings
  const labels = [
    'person',
    'group of people',
    'figure',
    'statue',
    'book',
    'globe',
    'musical instrument',
    'writing tablet',
    'architectural element',
  ];

  const detections = await detector(
    `file://${absolutePath}`,
    labels,
    { threshold: 0.05, top_k: 20, percentage: true },
  );

  // Convert to our format (percentage 0-100) and filter/merge overlapping boxes
  const raw = (detections as Array<{ score: number; label: string; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>)
    .map((d) => ({
      score: d.score,
      label: d.label,
      bbox: {
        x: Math.round(d.box.xmin * 100),
        y: Math.round(d.box.ymin * 100),
        width: Math.round((d.box.xmax - d.box.xmin) * 100),
        height: Math.round((d.box.ymax - d.box.ymin) * 100),
      },
    }))
    // Filter out tiny detections (< 5% in any dimension)
    .filter((d) => d.bbox.width >= 5 && d.bbox.height >= 5)
    // Sort by score descending
    .sort((a, b) => b.score - a.score);

  // Merge overlapping detections (IoU > 0.5 → keep higher score)
  const merged = mergeOverlapping(raw);

  console.log(`  Found ${raw.length} raw detections, merged to ${merged.length}`);
  for (const d of merged) {
    console.log(`    ${d.label} (${(d.score * 100).toFixed(1)}%) → [${d.bbox.x}, ${d.bbox.y}, ${d.bbox.width}x${d.bbox.height}]`);
  }

  return { detections: merged, width, height };
}

function iou(a: { x: number; y: number; width: number; height: number }, b: typeof a): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  return inter / (areaA + areaB - inter);
}

function mergeOverlapping(
  detections: Array<{ score: number; label: string; bbox: { x: number; y: number; width: number; height: number } }>,
) {
  const kept: typeof detections = [];
  const used = new Set<number>();

  for (let i = 0; i < detections.length; i++) {
    if (used.has(i)) continue;
    kept.push(detections[i]);
    for (let j = i + 1; j < detections.length; j++) {
      if (used.has(j)) continue;
      if (iou(detections[i].bbox, detections[j].bbox) > 0.5) {
        used.add(j);
      }
    }
  }

  return kept;
}

// ---------------------------------------------------------------------------
// Step 2: Claude Vision — identify figures using detected boxes
// ---------------------------------------------------------------------------
async function identifyRegions(
  imagePath: string,
  detections: Array<{ score: number; label: string; bbox: { x: number; y: number; width: number; height: number } }>,
  width: number,
  height: number,
) {
  const absolutePath = path.resolve(imagePath);

  // Resize for API
  let sendBuffer = fs.readFileSync(absolutePath);
  if (sendBuffer.length > 3_000_000) {
    sendBuffer = await sharp(absolutePath)
      .resize({ width: Math.min(width, 2400), withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  const base64 = sendBuffer.toString('base64');
  const mediaType = absolutePath.endsWith('.png') ? 'image/png' as const : 'image/jpeg' as const;

  console.log(`\n[2/3] Claude Vision identifying ${detections.length} detected regions...`);

  const boxDescriptions = detections.map((d, i) =>
    `Region ${i + 1}: "${d.label}" at [x:${d.bbox.x}%, y:${d.bbox.y}%, w:${d.bbox.width}%, h:${d.bbox.height}%] (confidence: ${(d.score * 100).toFixed(1)}%)`
  ).join('\n');

  const response = await client.messages.create({
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
            text: `This is a painting. An object detection model found these regions of interest:

${boxDescriptions}

Your job:
1. Identify the painting (title, artist, year/period)
2. For each detected region, identify WHO or WHAT is depicted. If it's a known figure, name them.
3. Adjust the bounding boxes if they're slightly off — you can see the actual image.
4. Merge regions that clearly belong to the same subject.
5. Drop any false detections (architectural elements that aren't interesting, etc.)
6. Keep 4-8 of the most interesting regions for a video narrative.

For each region provide:
- id: kebab-case identifier (e.g., "plato-aristotle")
- label: short display name (e.g., "Plato and Aristotle")
- description: 1-2 sentences about significance
- bbox: corrected bounding box as percentages {x, y, width, height} where x,y is top-left, all values 0-100. No dimension less than 5%.

Return ONLY valid JSON:
{
  "title": "Painting Title",
  "artist": "Artist Name",
  "year": "Year or period",
  "regions": [
    { "id": "...", "label": "...", "description": "...", "bbox": { "x": 10, "y": 20, "width": 30, "height": 40 } }
  ]
}`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const result = JSON.parse(text.replace(/```json\n?|\n?```/g, ''));

  console.log(`  Identified: "${result.title}" by ${result.artist}`);
  console.log(`  ${result.regions.length} regions: ${result.regions.map((r: { label: string }) => r.label).join(', ')}`);

  return result;
}

// ---------------------------------------------------------------------------
// Step 3: Claude — generate narrative story
// ---------------------------------------------------------------------------
async function generateStory(
  imagePath: string,
  paintingInfo: { title: string; artist: string; year: string; regions: Array<{ id: string; label: string; description: string; bbox: { x: number; y: number; width: number; height: number } }> },
) {
  const absolutePath = path.resolve(imagePath);

  let sendBuffer = fs.readFileSync(absolutePath);
  if (sendBuffer.length > 3_000_000) {
    sendBuffer = await sharp(absolutePath)
      .resize({ width: 2400, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  const base64 = sendBuffer.toString('base64');
  const mediaType = absolutePath.endsWith('.png') ? 'image/png' as const : 'image/jpeg' as const;

  console.log(`\n[3/3] Generating narrative story...`);

  const response = await client.messages.create({
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
            text: `You are creating a narrated video that explores the painting "${paintingInfo.title}" by ${paintingInfo.artist} (${paintingInfo.year}).

The video will pan and zoom across the painting, stopping at regions of interest. Here are the identified regions:

${JSON.stringify(paintingInfo.regions, null, 2)}

Create a compelling 30-45 second narrative as a sequence of "beats". Each beat focuses on one region or gives an overview.

Rules:
- Start with an "overview" beat (regionId: "overview") that introduces the painting
- End with an "overview" beat that wraps up the story
- Each beat: 4-6 seconds duration
- Narration: punchy, engaging, slightly dramatic — like a short-form documentary. 1-2 sentences max.
- Zoom: 1.0 for overview, 2.0-3.0 for focused regions
- Transition: "pan" for smooth camera movement, "cut" for dramatic hard cuts to full-screen close-ups. Use "cut" for individual character reveals, "pan" for overviews and groups.
- Mood: one of "dramatic", "mysterious", "humorous", "reverent", "tense", "peaceful", "epic"
- Total: 6-10 beats

Return ONLY valid JSON:
{
  "beats": [
    { "regionId": "overview", "narration": "...", "durationSeconds": 5, "zoom": 1, "transition": "pan", "mood": "epic" }
  ]
}`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const result = JSON.parse(text.replace(/```json\n?|\n?```/g, ''));

  console.log(`  Generated ${result.beats.length} story beats`);

  return result;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
async function main(imagePath: string) {
  const absolutePath = path.resolve(imagePath);
  const metadata = await sharp(absolutePath).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  // Step 1: OWL-ViT detection
  const { detections } = await detectRegions(imagePath);

  // Step 2: Claude identifies the detected regions
  const paintingInfo = await identifyRegions(imagePath, detections, width, height);

  // Step 3: Claude generates the narrative
  const storyData = await generateStory(imagePath, paintingInfo);

  // Assemble manifest
  const totalDurationSeconds = storyData.beats.reduce(
    (sum: number, b: { durationSeconds: number }) => sum + b.durationSeconds,
    0,
  );

  // Copy image to public directory
  const ext = path.extname(absolutePath);
  const imageFileName = `images/${path.basename(absolutePath, ext)}${ext}`;
  const destPath = path.resolve('public', imageFileName);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (path.resolve(absolutePath) !== path.resolve(destPath)) {
    fs.copyFileSync(absolutePath, destPath);
  }

  const manifest = {
    title: paintingInfo.title,
    artist: paintingInfo.artist,
    year: paintingInfo.year,
    imagePath: imageFileName,
    imageWidth: width,
    imageHeight: height,
    regions: paintingInfo.regions,
    beats: storyData.beats,
    totalDurationSeconds,
  };

  // Write manifest
  const outPath = path.resolve('src/videos/painting-explorer/manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  // Also update sample-manifest.json for people without API keys
  const samplePath = path.resolve('src/videos/painting-explorer/sample-manifest.json');
  fs.writeFileSync(samplePath, JSON.stringify(manifest, null, 2));

  console.log(`\nManifest written to ${outPath}`);
  console.log(`Sample manifest updated at ${samplePath}`);
  console.log(`Total duration: ${totalDurationSeconds}s (${storyData.beats.length} beats)`);
  console.log(`\nRun "npm run studio" to preview in Remotion Studio`);
}

// CLI entry point
const imagePath = process.argv[2];
if (!imagePath) {
  console.error('Usage: ANTHROPIC_API_KEY=sk-... npx tsx src/workflows/painting-explorer/generate.ts <image-path>');
  process.exit(1);
}

main(imagePath).catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
