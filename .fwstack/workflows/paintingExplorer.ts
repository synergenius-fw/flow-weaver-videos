// =============================================================================
// Node Types
// =============================================================================

/**
 * @flowWeaver nodeType
 * @expression
 * @label Detect Regions
 * @color "cyan"
 * @icon "search"
 * @input imageUrl - File URL to the painting image (file:///path/to/image.jpg)
 * @input [precomputed] - Pre-computed detections JSON string. If provided, OWL-ViT is skipped.
 * @output detections - Array of detected regions with label, score, and bbox as percentage coordinates (0-100)
 */
async function detectRegions(
  imageUrl: string,
  precomputed?: string,
): Promise<{
  detections: Array<{
    label: string;
    score: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
}> {
  if (precomputed) {
    const parsed = JSON.parse(precomputed);
    return { detections: Array.isArray(parsed) ? parsed : parsed.detections ?? [] };
  }

  const { pipeline } = await import('@huggingface/transformers');

  const detector = await pipeline(
    'zero-shot-object-detection',
    'Xenova/owlvit-base-patch32',
  );

  const labels = [
    'person',
    'group of people',
    'figure',
    'statue',
    'book',
    'globe',
    'musical instrument',
    'writing tablet',
  ];

  const rawDetections = await detector(imageUrl, labels, {
    threshold: 0.05,
    top_k: 20,
    percentage: true,
  }) as Array<{ score: number; label: string; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>;

  const converted = rawDetections
    .map((d) => ({
      label: d.label,
      score: d.score,
      bbox: {
        x: Math.round(d.box.xmin * 100),
        y: Math.round(d.box.ymin * 100),
        width: Math.round((d.box.xmax - d.box.xmin) * 100),
        height: Math.round((d.box.ymax - d.box.ymin) * 100),
      },
    }))
    .filter((d) => d.bbox.width >= 5 && d.bbox.height >= 5)
    .sort((a, b) => b.score - a.score);

  const kept: typeof converted = [];
  const used = new Set<number>();
  for (let i = 0; i < converted.length; i++) {
    if (used.has(i)) continue;
    kept.push(converted[i]);
    for (let j = i + 1; j < converted.length; j++) {
      if (used.has(j)) continue;
      const a = converted[i].bbox;
      const b = converted[j].bbox;
      const ix1 = Math.max(a.x, b.x);
      const iy1 = Math.max(a.y, b.y);
      const ix2 = Math.min(a.x + a.width, b.x + b.width);
      const iy2 = Math.min(a.y + a.height, b.y + b.height);
      const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
      const union = a.width * a.height + b.width * b.height - inter;
      if (inter / union > 0.5) used.add(j);
    }
  }

  return { detections: kept };
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Build Identify Prompt
 * @color "cyan"
 * @icon "search"
 * @input detections - Raw CV detections with bounding boxes
 * @output prompt - Formatted prompt for the identify agent
 */
function buildIdentifyPrompt(
  detections: Array<{
    label: string;
    score: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>,
): string {
  const boxDescriptions = detections.map((d, i) =>
    `Region ${i + 1}: "${d.label}" at [x:${d.bbox.x}%, y:${d.bbox.y}%, w:${d.bbox.width}%, h:${d.bbox.height}%] (confidence: ${(d.score * 100).toFixed(1)}%)`
  ).join('\n');

  return `An object detection model found these regions of interest in a painting:

${boxDescriptions}

Look at the painting image and:
1. Identify the painting (title, artist, year/period)
2. For each detected region, identify WHO or WHAT is depicted
3. Adjust bounding boxes if slightly off
4. Merge regions that belong to the same subject
5. Drop false detections
6. Keep 4-8 most interesting regions

Return ONLY valid JSON:
{
  "title": "Painting Title",
  "artist": "Artist Name",
  "year": "Year or period",
  "regions": [
    { "id": "kebab-case-id", "label": "Display Name", "description": "1-2 sentences", "bbox": { "x": 10, "y": 20, "width": 30, "height": 40 } }
  ]
}`;
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Parse Identify Result
 * @color "cyan"
 * @icon "search"
 * @input agentResult - Raw agent result object
 * @output title - Painting title
 * @output artist - Artist name
 * @output year - Year or period
 * @output regions - Array of identified regions
 */
function parseIdentifyResult(
  agentResult: any,
): {
  title: string;
  artist: string;
  year: string;
  regions: Array<{
    id: string;
    label: string;
    description: string;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
} {
  const data = typeof agentResult === 'string' ? JSON.parse(agentResult) : agentResult;
  return {
    title: data.title,
    artist: data.artist,
    year: data.year,
    regions: data.regions,
  };
}

/**
 * @flowWeaver nodeType
 * @label Validate Regions
 * @color "green"
 * @icon "verified"
 * @input regions - Array of detected regions to validate
 * @output validatedRegions - The validated regions array (unchanged if valid)
 * @output errors - Array of validation error messages (empty if valid)
 */
function validateRegions(
  execute: boolean,
  regions: Array<{
    id: string;
    label: string;
    description: string;
    bbox: { x: number; y: number; width: number; height: number };
  }>,
): {
  onSuccess: boolean;
  onFailure: boolean;
  validatedRegions: Array<{
    id: string;
    label: string;
    description: string;
    bbox: { x: number; y: number; width: number; height: number };
  }> | null;
  errors: string[];
} {
  if (!execute) return { onSuccess: false, onFailure: false, validatedRegions: null, errors: [] };

  const errors: string[] = [];

  if (!regions || regions.length < 4) {
    errors.push(`Expected at least 4 regions, got ${regions?.length ?? 0}`);
  }
  if (regions && regions.length > 8) {
    errors.push(`Expected at most 8 regions, got ${regions.length}`);
  }

  const ids = new Set<string>();
  if (regions) {
    for (const region of regions) {
      if (ids.has(region.id)) {
        errors.push(`Duplicate region id: "${region.id}"`);
      }
      ids.add(region.id);

      const b = region.bbox;
      if (b.x + b.width > 100) {
        errors.push(`Region "${region.id}": bbox x(${b.x}) + width(${b.width}) exceeds 100`);
      }
      if (b.y + b.height > 100) {
        errors.push(`Region "${region.id}": bbox y(${b.y}) + height(${b.height}) exceeds 100`);
      }
      if (b.width < 5) {
        errors.push(`Region "${region.id}": bbox width(${b.width}) is less than 5%`);
      }
      if (b.height < 5) {
        errors.push(`Region "${region.id}": bbox height(${b.height}) is less than 5%`);
      }
    }
  }

  if (errors.length > 0) {
    return { onSuccess: false, onFailure: true, validatedRegions: null, errors };
  }

  return { onSuccess: true, onFailure: false, validatedRegions: regions, errors: [] };
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Build Story Prompt
 * @color "cyan"
 * @icon "search"
 * @input title - Painting title
 * @input artist - Artist name
 * @input year - Year or period
 * @input regions - Validated regions of interest
 * @output prompt - Formatted prompt for the story agent
 */
function buildStoryPrompt(
  title: string,
  artist: string,
  year: string,
  regions: Array<{
    id: string;
    label: string;
    description: string;
    bbox: { x: number; y: number; width: number; height: number };
  }>,
): string {
  return `Create a narrated video exploring "${title}" by ${artist} (${year}).

Identified regions:
${JSON.stringify(regions, null, 2)}

Create a 30-45 second narrative as 6-10 beats.

Rules:
- Start and end with regionId "overview"
- Each beat: 4-6 seconds
- Narration: punchy, documentary style, 1-2 sentences max
- Zoom: 1.0 for overview, 2.0-3.0 for regions
- Transition: "pan" for smooth camera, "cut" for dramatic hard cuts (use for character reveals)
- Mood: dramatic, mysterious, humorous, reverent, tense, peaceful, or epic

Return ONLY valid JSON:
{
  "beats": [
    { "regionId": "overview", "narration": "...", "durationSeconds": 5, "zoom": 1, "transition": "pan", "mood": "epic" }
  ]
}`;
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Parse Story Result
 * @color "cyan"
 * @icon "search"
 * @input agentResult - Raw agent result object
 * @output beats - Array of scene beats
 */
function parseStoryResult(
  agentResult: any,
): {
  beats: Array<{
    regionId: string;
    narration: string;
    durationSeconds: number;
    zoom: number;
    transition: string;
    mood: string;
  }>;
} {
  const data = typeof agentResult === 'string' ? JSON.parse(agentResult) : agentResult;
  return { beats: data.beats };
}

/**
 * @flowWeaver nodeType
 * @label Validate Story
 * @color "green"
 * @icon "verified"
 * @input beats - Array of scene beats to validate
 * @input regions - Validated regions for cross-referencing regionIds
 * @output validatedBeats - The validated beats array (unchanged if valid)
 * @output errors - Array of validation error messages (empty if valid)
 */
function validateStory(
  execute: boolean,
  beats: Array<{
    regionId: string;
    narration: string;
    durationSeconds: number;
    zoom: number;
    transition: string;
    mood: string;
  }>,
  regions: Array<{
    id: string;
    label: string;
    description: string;
    bbox: { x: number; y: number; width: number; height: number };
  }>,
): {
  onSuccess: boolean;
  onFailure: boolean;
  validatedBeats: Array<{
    regionId: string;
    narration: string;
    durationSeconds: number;
    zoom: number;
    transition: string;
    mood: string;
  }> | null;
  errors: string[];
} {
  if (!execute) return { onSuccess: false, onFailure: false, validatedBeats: null, errors: [] };

  const errors: string[] = [];
  const validMoods = ['dramatic', 'mysterious', 'humorous', 'reverent', 'tense', 'peaceful', 'epic'];
  const validTransitions = ['pan', 'cut'];
  const regionIds = new Set(regions.map((r) => r.id));

  if (!beats || beats.length < 6) {
    errors.push(`Expected at least 6 beats, got ${beats?.length ?? 0}`);
  }
  if (beats && beats.length > 10) {
    errors.push(`Expected at most 10 beats, got ${beats.length}`);
  }

  if (beats && beats.length > 0) {
    if (beats[0].regionId !== 'overview') {
      errors.push(`First beat must have regionId "overview", got "${beats[0].regionId}"`);
    }
    if (beats[beats.length - 1].regionId !== 'overview') {
      errors.push(`Last beat must have regionId "overview", got "${beats[beats.length - 1].regionId}"`);
    }

    let totalDuration = 0;
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      totalDuration += beat.durationSeconds;

      if (beat.regionId !== 'overview' && !regionIds.has(beat.regionId)) {
        errors.push(`Beat ${i}: regionId "${beat.regionId}" does not match any detected region`);
      }
      if (beat.durationSeconds < 4 || beat.durationSeconds > 6) {
        errors.push(`Beat ${i}: durationSeconds ${beat.durationSeconds} is outside 4-6 range`);
      }
      if (beat.zoom < 0.8 || beat.zoom > 5.0) {
        errors.push(`Beat ${i}: zoom ${beat.zoom} is outside 0.8-5.0 range`);
      }
      if (!validMoods.includes(beat.mood)) {
        errors.push(`Beat ${i}: mood "${beat.mood}" is not one of ${validMoods.join(', ')}`);
      }
      if (beat.transition && !validTransitions.includes(beat.transition)) {
        errors.push(`Beat ${i}: transition "${beat.transition}" is not one of ${validTransitions.join(', ')}`);
      }
    }

    if (totalDuration < 30 || totalDuration > 50) {
      errors.push(`Total duration ${totalDuration}s is outside 30-50s range`);
    }
  }

  if (errors.length > 0) {
    return { onSuccess: false, onFailure: true, validatedBeats: null, errors };
  }

  return { onSuccess: true, onFailure: false, validatedBeats: beats, errors: [] };
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Plan Scenes
 * @color "cyan"
 * @icon "description"
 * @input title - Painting title
 * @input artist - Artist name
 * @input year - Year or period
 * @input imagePath - File path to the source painting image
 * @input imageWidth - Source image width in pixels
 * @input imageHeight - Source image height in pixels
 * @input regions - Validated regions of interest
 * @input beats - Validated scene beats
 * @output manifest - Complete SceneManifest object for Remotion rendering
 */
function planScenes(
  title: string,
  artist: string,
  year: string,
  imagePath: string,
  imageWidth: number,
  imageHeight: number,
  regions: Array<{
    id: string;
    label: string;
    description: string;
    bbox: { x: number; y: number; width: number; height: number };
  }>,
  beats: Array<{
    regionId: string;
    narration: string;
    durationSeconds: number;
    zoom: number;
    transition: string;
    mood: string;
  }>,
): {
  manifest: {
    title: string;
    artist: string;
    year: string;
    imagePath: string;
    imageWidth: number;
    imageHeight: number;
    regions: typeof regions;
    beats: typeof beats;
    totalDurationSeconds: number;
  };
} {
  const totalDurationSeconds = beats.reduce((sum, b) => sum + b.durationSeconds, 0);

  return {
    manifest: {
      title,
      artist,
      year,
      imagePath,
      imageWidth,
      imageHeight,
      regions,
      beats,
      totalDurationSeconds,
    },
  };
}

// =============================================================================
// Workflow
// =============================================================================

/**
 * @flowWeaver workflow
 * @description Detects regions in a painting using OWL-ViT (or pre-computed), identifies them via an agent, generates a narrated story via an agent, validates structure, and assembles a Remotion scene manifest.
 *
 * @param imagePath - File path to the source painting image for the manifest
 * @param imageUrl - File URL to the painting image for OWL-ViT detection
 * @param imageMediaType - MIME type of the image (image/jpeg or image/png)
 * @param imageWidth - Source image width in pixels
 * @param imageHeight - Source image height in pixels
 * @param [precomputedDetections] - Pre-computed OWL-ViT detections as JSON string
 * @returns manifest - Complete SceneManifest object for Remotion rendering
 *
 * @position Start 0 150
 * @node detect detectRegions [position: 300 150] [color: "cyan"] [icon: "search"]
 * @node buildIdPrompt buildIdentifyPrompt [position: 600 50] [color: "cyan"] [icon: "search"]
 * @node identify waitForAgent [position: 900 150] [color: "purple"] [icon: "smartToy"] [expr: agentId="'image-identifier'"]
 * @node parseId parseIdentifyResult [position: 1200 150] [color: "cyan"] [icon: "search"]
 * @node vRegions validateRegions [position: 1500 150] [color: "green"] [icon: "verified"] [suppress: "UNUSED_OUTPUT_PORT"]
 * @node buildStPrompt buildStoryPrompt [position: 1800 50] [color: "cyan"] [icon: "search"]
 * @node story waitForAgent [position: 2100 150] [color: "purple"] [icon: "smartToy"] [expr: agentId="'story-generator'"]
 * @node parseSt parseStoryResult [position: 2400 150] [color: "cyan"] [icon: "search"]
 * @node vStory validateStory [position: 2700 150] [color: "green"] [icon: "verified"] [suppress: "UNUSED_OUTPUT_PORT"]
 * @node scenes planScenes [position: 3000 150] [color: "cyan"] [icon: "description"]
 * @position Exit 3300 150
 *
 * @path Start -> detect -> buildIdPrompt -> identify -> parseId -> vRegions -> buildStPrompt -> story -> parseSt -> vStory -> scenes -> Exit
 * @path detect:fail -> Exit
 * @path identify:fail -> Exit
 * @path vRegions:fail -> Exit
 * @path story:fail -> Exit
 * @path vStory:fail -> Exit
 *
 * @connect Start.imageUrl -> detect.imageUrl
 * @connect Start.precomputedDetections -> detect.precomputed
 * @connect detect.detections -> buildIdPrompt.detections
 * @connect buildIdPrompt.prompt -> identify.prompt
 * @connect detect.detections -> identify.context
 * @connect identify.agentResult -> parseId.agentResult
 * @connect parseId.regions -> vRegions.regions
 * @connect parseId.title -> buildStPrompt.title
 * @connect parseId.artist -> buildStPrompt.artist
 * @connect parseId.year -> buildStPrompt.year
 * @connect vRegions.validatedRegions -> buildStPrompt.regions
 * @connect buildStPrompt.prompt -> story.prompt
 * @connect vRegions.validatedRegions -> story.context
 * @connect story.agentResult -> parseSt.agentResult
 * @connect parseSt.beats -> vStory.beats
 * @connect vRegions.validatedRegions -> vStory.regions
 * @connect parseId.title -> scenes.title
 * @connect parseId.artist -> scenes.artist
 * @connect parseId.year -> scenes.year
 * @connect Start.imagePath -> scenes.imagePath
 * @connect Start.imageWidth -> scenes.imageWidth
 * @connect Start.imageHeight -> scenes.imageHeight
 * @connect vRegions.validatedRegions -> scenes.regions
 * @connect vStory.validatedBeats -> scenes.beats
 * @connect scenes.manifest -> Exit.manifest
 */
export function paintingExplorer(
  execute: boolean,
  params: {
    imagePath: string;
    imageUrl: string;
    imageMediaType: string;
    imageWidth: number;
    imageHeight: number;
    precomputedDetections?: string;
  },
): {
  onSuccess: boolean;
  onFailure: boolean;
  manifest: {
    title: string;
    artist: string;
    year: string;
    imagePath: string;
    imageWidth: number;
    imageHeight: number;
    regions: Array<{
      id: string;
      label: string;
      description: string;
      bbox: { x: number; y: number; width: number; height: number };
    }>;
    beats: Array<{
      regionId: string;
      narration: string;
      durationSeconds: number;
      zoom: number;
      transition: string;
      mood: string;
    }>;
    totalDurationSeconds: number;
  } | null;
} {
  throw new Error('Not implemented');
}
