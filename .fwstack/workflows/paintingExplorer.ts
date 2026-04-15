// =============================================================================
// Node Types
// =============================================================================

/**
 * @flowWeaver nodeType
 * @expression
 * @label Analyze Image
 * @color "purple"
 * @icon "smartToy"
 * @input imageBase64 - Base64-encoded painting image
 * @input imageMediaType - MIME type of the image (image/jpeg or image/png)
 * @output title - Painting title identified by the vision model
 * @output artist - Artist name identified by the vision model
 * @output year - Year or period identified by the vision model
 * @output regions - Array of regions of interest with id, label, description, and bbox (percentage coordinates)
 */
async function analyzeImage(
  imageBase64: string,
  imageMediaType: string,
): Promise<{
  title: string;
  artist: string;
  year: string;
  regions: Array<{
    id: string;
    label: string;
    description: string;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
}> {
  const provider = (globalThis as any).__fw_llm_provider__;
  if (provider) {
    const response = await provider.call({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageMediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: `Analyze this painting and identify 4-8 regions of interest (people, groups, objects, architectural elements).

For each region, provide:
- id: a kebab-case identifier
- label: short human-readable name
- description: 1-2 sentences about what is depicted and its significance
- bbox: bounding box as percentage of image dimensions (x, y, width, height) where x,y is the top-left corner. Values should be 0-100. No dimension should be less than 5%.

Return ONLY valid JSON:
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
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
  }
  throw new Error('No LLM provider available. Set __fw_llm_provider__ or use mocks.');
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
 * @label Generate Story
 * @color "purple"
 * @icon "smartToy"
 * @input imageBase64 - Base64-encoded painting image for visual context
 * @input imageMediaType - MIME type of the image
 * @input title - Painting title
 * @input artist - Artist name
 * @input year - Year or period
 * @input regions - Validated regions of interest
 * @output beats - Array of scene beats with regionId, narration, durationSeconds, zoom, and mood
 */
async function generateStory(
  imageBase64: string,
  imageMediaType: string,
  title: string,
  artist: string,
  year: string,
  regions: Array<{
    id: string;
    label: string;
    description: string;
    bbox: { x: number; y: number; width: number; height: number };
  }>,
): Promise<{
  beats: Array<{
    regionId: string;
    narration: string;
    durationSeconds: number;
    zoom: number;
    mood: string;
  }>;
}> {
  const provider = (globalThis as any).__fw_llm_provider__;
  if (provider) {
    const response = await provider.call({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: imageMediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: `You are creating a narrated video that explores the painting "${title}" by ${artist} (${year}).

The video pans and zooms across the painting, stopping at regions of interest. Here are the detected regions:

${JSON.stringify(regions, null, 2)}

Create a compelling 30-40 second narrative as a sequence of 6-8 "beats". Each beat focuses on one region or gives an overview.

Rules:
- Start with an "overview" beat (regionId: "overview") that introduces the painting
- End with an "overview" beat that wraps up the story
- Each beat: 4-6 seconds duration
- Narration: punchy, engaging, slightly dramatic — like a short-form documentary. 1-2 sentences max.
- Zoom: 1.0 for overview, 2.0-3.0 for focused regions
- Mood: one of "dramatic", "mysterious", "humorous", "reverent", "tense", "peaceful", "epic"

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
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
  }
  throw new Error('No LLM provider available. Set __fw_llm_provider__ or use mocks.');
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
    mood: string;
  }> | null;
  errors: string[];
} {
  if (!execute) return { onSuccess: false, onFailure: false, validatedBeats: null, errors: [] };

  const errors: string[] = [];
  const validMoods = ['dramatic', 'mysterious', 'humorous', 'reverent', 'tense', 'peaceful', 'epic'];
  const regionIds = new Set(regions.map((r) => r.id));

  if (!beats || beats.length < 6) {
    errors.push(`Expected at least 6 beats, got ${beats?.length ?? 0}`);
  }
  if (beats && beats.length > 8) {
    errors.push(`Expected at most 8 beats, got ${beats.length}`);
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
    }

    if (totalDuration < 30 || totalDuration > 40) {
      errors.push(`Total duration ${totalDuration}s is outside 30-40s range`);
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
      mood: string;
    }>;
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
 * @description Analyzes a painting image using Claude Vision to identify regions of interest, generates a narrated story mapped to those regions, validates the story structure, and assembles a Remotion-compatible scene manifest with camera keyframes and timing.
 *
 * @param imagePath - File path to the source painting image for the manifest
 * @param imageBase64 - Base64-encoded painting image for vision analysis
 * @param imageMediaType - MIME type of the image (image/jpeg or image/png)
 * @param imageWidth - Source image width in pixels
 * @param imageHeight - Source image height in pixels
 * @returns manifest - Complete SceneManifest object for Remotion rendering
 *
 * @position Start 0 150
 * @node analyze analyzeImage [position: 300 150] [color: "purple"] [icon: "smartToy"]
 * @node vRegions validateRegions [position: 600 150] [color: "green"] [icon: "verified"] [suppress: "UNUSED_OUTPUT_PORT"]
 * @node story generateStory [position: 900 150] [color: "purple"] [icon: "smartToy"]
 * @node vStory validateStory [position: 1200 150] [color: "green"] [icon: "verified"] [suppress: "UNUSED_OUTPUT_PORT"]
 * @node scenes planScenes [position: 1500 150] [color: "cyan"] [icon: "description"]
 * @position Exit 1800 150
 *
 * @path Start -> analyze -> vRegions -> story -> vStory -> scenes -> Exit
 * @path analyze:fail -> Exit
 * @path vRegions:fail -> Exit
 * @path story:fail -> Exit
 * @path vStory:fail -> Exit
 *
 * @connect Start.imageBase64 -> analyze.imageBase64
 * @connect Start.imageMediaType -> analyze.imageMediaType
 * @connect analyze.regions -> vRegions.regions
 * @connect Start.imageBase64 -> story.imageBase64
 * @connect Start.imageMediaType -> story.imageMediaType
 * @connect analyze.title -> story.title
 * @connect analyze.artist -> story.artist
 * @connect analyze.year -> story.year
 * @connect vRegions.validatedRegions -> story.regions
 * @connect story.beats -> vStory.beats
 * @connect vRegions.validatedRegions -> vStory.regions
 * @connect analyze.title -> scenes.title
 * @connect analyze.artist -> scenes.artist
 * @connect analyze.year -> scenes.year
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
    imageBase64: string;
    imageMediaType: string;
    imageWidth: number;
    imageHeight: number;
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
      mood: string;
    }>;
    totalDurationSeconds: number;
  } | null;
} {
  throw new Error('Not implemented');
}
