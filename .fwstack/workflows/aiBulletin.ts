// =============================================================================
// Shared Types
// =============================================================================

interface Story {
  title: string;
  url: string;
  source: string;
  score: number;
  snippet: string;
  category?: string;
  thumbnailPath?: string | null;
}

const VALID_CATEGORIES = ['new-model', 'regulation', 'funding', 'open-source', 'research', 'controversy', 'product'] as const;
const VALID_SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed'] as const;

// =============================================================================
// Node Types
// =============================================================================

/**
 * @flowWeaver nodeType
 * @expression
 * @label Fetch HN
 * @color "orange"
 * @icon "search"
 * @output stories - Array of AI stories from Hacker News with title, url, points, source
 */
async function fetchHN(): Promise<{
  stories: Array<{ title: string; url: string; source: string; score: number; snippet: string }>;
}> {
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=AI+OR+LLM+OR+GPT+OR+Claude+OR+machine+learning&tags=story&numericFilters=created_at_i>${weekAgo}&hitsPerPage=50`,
      { signal: controller.signal },
    );

    if (!res.ok) throw new Error(`HN API returned ${res.status}`);

    const data = await res.json() as {
      hits: Array<{
        title: string;
        url: string | null;
        objectID: string;
        points: number;
        author: string;
        created_at: string;
      }>;
    };

    const stories = (data.hits || [])
      .filter((h) => h.title && h.title.trim().length > 0)
      .map((h) => ({
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        source: 'hackernews',
        score: h.points || 0,
        snippet: '',
      }));

    return { stories };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Fetch Reddit
 * @color "orange"
 * @icon "search"
 * @output stories - Array of AI stories from Reddit with title, url, score, source
 */
async function fetchReddit(): Promise<{
  stories: Array<{ title: string; url: string; source: string; score: number; snippet: string }>;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(
      'https://www.reddit.com/r/MachineLearning+artificial/top.json?t=week&limit=30',
      {
        headers: { 'User-Agent': 'flow-weaver-videos/1.0' },
        signal: controller.signal,
      },
    );

    if (!res.ok) throw new Error(`Reddit API returned ${res.status}`);

    const data = await res.json() as {
      data: {
        children: Array<{
          data: {
            title: string;
            url: string;
            permalink: string;
            score: number;
            subreddit_name_prefixed: string;
            stickied: boolean;
            selftext: string;
          };
        }>;
      };
    };

    const stories = (data.data?.children || [])
      .map((c) => c.data)
      .filter((d) => !d.stickied && d.score >= 10)
      .map((d) => ({
        title: d.title,
        url: d.url.startsWith('http') ? d.url : `https://reddit.com${d.permalink}`,
        source: d.subreddit_name_prefixed,
        score: d.score,
        snippet: (d.selftext || '').slice(0, 200),
      }));

    return { stories };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Fetch ArXiv
 * @color "orange"
 * @icon "search"
 * @output stories - Array of AI papers from ArXiv with title, url, snippet, source
 */
async function fetchArxiv(): Promise<{
  stories: Array<{ title: string; url: string; source: string; score: number; snippet: string }>;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(
      'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=20',
      { signal: controller.signal },
    );

    if (!res.ok) throw new Error(`ArXiv API returned ${res.status}`);

    const xml = await res.text();
    const entries = xml.split('<entry>').slice(1);

    const stories = entries.map((entry) => {
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
      const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);

      const title = (titleMatch?.[1] || '').replace(/\s+/g, ' ').trim();
      const url = (idMatch?.[1] || '').trim();
      const snippet = (summaryMatch?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 200);

      return {
        title,
        url,
        source: 'arxiv',
        score: 50, // fixed baseline for arxiv
        snippet,
      };
    }).filter((s) => s.title.length > 0);

    return { stories };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Merge Stories
 * @color "cyan"
 * @icon "sort"
 * @input hnStories - Stories from Hacker News
 * @input redditStories - Stories from Reddit
 * @input arxivStories - Stories from ArXiv
 * @output merged - Deduplicated and normalized array of stories sorted by score
 */
function mergeStories(
  hnStories: Array<{ title: string; url: string; source: string; score: number; snippet: string }>,
  redditStories: Array<{ title: string; url: string; source: string; score: number; snippet: string }>,
  arxivStories: Array<{ title: string; url: string; source: string; score: number; snippet: string }>,
): {
  merged: Array<{ title: string; url: string; source: string; score: number; snippet: string }>;
} {
  const all = [...(hnStories || []), ...(redditStories || []), ...(arxivStories || [])];

  // Deduplicate by exact URL
  const byUrl = new Map<string, typeof all[0]>();
  for (const s of all) {
    const existing = byUrl.get(s.url);
    if (!existing || s.score > existing.score) {
      byUrl.set(s.url, s);
    }
  }

  let deduped = Array.from(byUrl.values());

  // Fuzzy title dedup: word overlap > 60%
  const toRemove = new Set<number>();
  for (let i = 0; i < deduped.length; i++) {
    if (toRemove.has(i)) continue;
    const wordsA = new Set(deduped[i].title.toLowerCase().split(/\s+/));
    for (let j = i + 1; j < deduped.length; j++) {
      if (toRemove.has(j)) continue;
      const wordsB = new Set(deduped[j].title.toLowerCase().split(/\s+/));
      const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
      const union = new Set([...wordsA, ...wordsB]).size;
      if (union > 0 && intersection / union > 0.6) {
        toRemove.add(deduped[i].score >= deduped[j].score ? j : i);
      }
    }
  }
  deduped = deduped.filter((_, i) => !toRemove.has(i));

  // Normalize scores to 0-100
  const maxScore = Math.max(...deduped.map((s) => s.score), 1);
  const normalized = deduped.map((s) => ({
    ...s,
    score: Math.round((s.score / maxScore) * 100),
  }));

  normalized.sort((a, b) => b.score - a.score);

  return { merged: normalized };
}

/**
 * @flowWeaver nodeType
 * @label Rank Stories
 * @color "green"
 * @icon "verified"
 * @input merged - Deduplicated stories array
 * @output ranked - Top 8-12 stories with category assignments and at least 3 categories
 * @output errors - Validation error messages
 */
function rankStories(
  execute: boolean,
  merged: Array<{ title: string; url: string; source: string; score: number; snippet: string }>,
): {
  onSuccess: boolean;
  onFailure: boolean;
  ranked: Array<{ title: string; url: string; source: string; score: number; snippet: string; category: string }> | null;
  errors: string[];
} {
  if (!execute) return { onSuccess: false, onFailure: false, ranked: null, errors: [] };

  if (!merged || merged.length < 3) {
    return { onSuccess: false, onFailure: true, ranked: null, errors: [`Insufficient stories found (need at least 3, got ${merged?.length || 0})`] };
  }

  function categorize(title: string, snippet: string): string {
    const text = `${title} ${snippet}`.toLowerCase();
    if (/\b(gpt|claude|llama|gemini|model|release|launch)\b/.test(text)) return 'new-model';
    if (/\b(regulation|law|ban|policy|government|eu\b|act\b)/.test(text)) return 'regulation';
    if (/\b(funding|raise|invest|valuation|billion|million|acquisition)\b/.test(text)) return 'funding';
    if (/\b(open.?source|github|apache|mit license)\b/.test(text)) return 'open-source';
    if (/\b(paper|research|study|benchmark|arxiv)\b/.test(text)) return 'research';
    if (/\b(deepfake|bias|lawsuit|controversy|fired|safety|risk|concern)\b/.test(text)) return 'controversy';
    return 'product';
  }

  let categorized = merged.map((s) => ({ ...s, category: categorize(s.title, s.snippet) }));

  // Take top 12
  let selected = categorized.slice(0, 12);
  const remaining = categorized.slice(12);

  // Ensure at least 3 categories
  let categories = new Set(selected.map((s) => s.category));
  if (categories.size < 3 && remaining.length > 0) {
    const needed = 3 - categories.size;
    const underrepresented = remaining.filter((s) => !categories.has(s.category));
    for (let i = 0; i < Math.min(needed, underrepresented.length); i++) {
      // Swap lowest-scored same-category story
      const dupCategory = [...selected].reverse().find((s) => {
        const count = selected.filter((x) => x.category === s.category).length;
        return count > 1;
      });
      if (dupCategory) {
        const idx = selected.lastIndexOf(dupCategory);
        selected[idx] = underrepresented[i];
      }
    }
    categories = new Set(selected.map((s) => s.category));
  }

  // Trim to 8-12
  selected = selected.slice(0, 12);
  if (selected.length > 12) selected = selected.slice(0, 12);

  return { onSuccess: true, onFailure: false, ranked: selected, errors: [] };
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Fetch Thumbnails
 * @color "cyan"
 * @icon "download"
 * @input ranked - Ranked stories array
 * @input outputDir - Absolute path to public directory
 * @output thumbnails - Array of thumbnail file paths (or null) indexed to match stories
 */
async function fetchThumbnails(
  ranked: Array<{ title: string; url: string; source: string; score: number; snippet: string; category: string }>,
  outputDir: string,
): Promise<{
  thumbnails: Array<string | null>;
}> {
  const fs = await import('fs');
  const path = await import('path');

  const thumbDir = path.join(outputDir, 'assets', 'thumbnails');
  fs.mkdirSync(thumbDir, { recursive: true });

  const thumbnails: Array<string | null> = [];

  for (let i = 0; i < ranked.length; i++) {
    const story = ranked[i];
    const filePath = path.join(thumbDir, `${i}.jpg`);
    const relPath = `assets/thumbnails/${i}.jpg`;

    if (fs.existsSync(filePath)) {
      thumbnails.push(relPath);
      continue;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(story.url, {
        headers: { 'User-Agent': 'flow-weaver-videos/1.0' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) { thumbnails.push(null); continue; }

      const html = await res.text();
      const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

      if (ogMatch?.[1]) {
        let imgUrl = ogMatch[1];
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        else if (imgUrl.startsWith('/')) {
          const origin = new URL(story.url).origin;
          imgUrl = origin + imgUrl;
        }

        const imgRes = await fetch(imgUrl);
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          if (buffer.length > 1000) {
            fs.writeFileSync(filePath, buffer);
            thumbnails.push(relPath);
            continue;
          }
        }
      }

      thumbnails.push(null);
    } catch {
      thumbnails.push(null);
    }
  }

  return { thumbnails };
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Build Prompt
 * @color "cyan"
 * @icon "description"
 * @input ranked - Ranked and categorized stories
 * @output prompt - Formatted prompt string for the script agent
 */
function buildPrompt(
  ranked: Array<{ title: string; url: string; source: string; score: number; snippet: string; category: string }>,
): string {
  const lines: string[] = [];
  lines.push('Write a TV news bulletin script for AI Weekly.\n');
  lines.push('Stories to cover:\n');

  for (let i = 0; i < ranked.length; i++) {
    const s = ranked[i];
    lines.push(`[${i}] [${s.category.toUpperCase()}] ${s.title}`);
    lines.push(`    Source: ${s.source} | Score: ${s.score}`);
    if (s.snippet) lines.push(`    ${s.snippet}`);
    lines.push('');
  }

  lines.push('Write one beat per story. Each beat must have:');
  lines.push('- storyIndex: number (matching the [index] above)');
  lines.push('- category: one of new-model, regulation, funding, open-source, research, controversy, product');
  lines.push('- headline: punchy headline under 80 chars');
  lines.push('- narration: 2-3 sentences in TV anchor broadcast style, under 400 chars');
  lines.push('- sentiment: one of positive, negative, neutral, mixed');
  lines.push('');
  lines.push('Use these transitions between stories:');
  lines.push('- First story: "In our top story this week..."');
  lines.push('- Subsequent: "Moving on...", "In other news...", "Meanwhile...", "Turning to..."');
  lines.push('- Last story: "And finally..."');
  lines.push('');
  lines.push('Return ONLY valid JSON:');
  lines.push('{ "beats": [{ "storyIndex": 0, "category": "new-model", "headline": "...", "narration": "...", "sentiment": "positive" }] }');

  return lines.join('\n');
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Parse Script
 * @color "cyan"
 * @icon "search"
 * @input agentResult - Raw agent result object
 * @output beats - Parsed array of bulletin beats
 */
function parseScript(
  agentResult: any,
): {
  beats: Array<{
    storyIndex: number;
    category: string;
    headline: string;
    narration: string;
    sentiment: string;
  }>;
} {
  const data = typeof agentResult === 'string' ? JSON.parse(agentResult) : agentResult;
  return { beats: data.beats };
}

/**
 * @flowWeaver nodeType
 * @label Validate Script
 * @color "green"
 * @icon "verified"
 * @input beats - Array of bulletin beats to validate
 * @output validatedBeats - Validated beats array
 * @output errors - Validation error messages
 */
function validateScript(
  execute: boolean,
  beats: Array<{
    storyIndex: number;
    category: string;
    headline: string;
    narration: string;
    sentiment: string;
  }>,
): {
  onSuccess: boolean;
  onFailure: boolean;
  validatedBeats: Array<{
    storyIndex: number;
    category: string;
    headline: string;
    narration: string;
    sentiment: string;
  }> | null;
  errors: string[];
} {
  if (!execute) return { onSuccess: false, onFailure: false, validatedBeats: null, errors: [] };

  const errors: string[] = [];
  const validCats = new Set([...VALID_CATEGORIES, 'intro', 'outro']);
  const validSentiments = new Set(VALID_SENTIMENTS);

  if (!beats || beats.length < 8) {
    errors.push(`Expected at least 8 beats, got ${beats?.length || 0}`);
  }
  if (beats && beats.length > 14) {
    errors.push(`Expected at most 14 beats, got ${beats.length}`);
  }

  if (beats) {
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (!validCats.has(b.category)) {
        errors.push(`Beat ${i}: category "${b.category}" is not valid`);
      }
      if (!b.narration || b.narration.trim().length === 0) {
        errors.push(`Beat ${i}: narration is empty`);
      }
      if (b.narration && b.narration.length > 400) {
        errors.push(`Beat ${i}: narration exceeds 400 characters (${b.narration.length})`);
      }
      if (!validSentiments.has(b.sentiment as any)) {
        errors.push(`Beat ${i}: sentiment "${b.sentiment}" is not valid`);
      }
      if (!b.headline || b.headline.trim().length === 0) {
        errors.push(`Beat ${i}: headline is empty`);
      }
      if (b.headline && b.headline.length > 80) {
        errors.push(`Beat ${i}: headline exceeds 80 characters (${b.headline.length})`);
      }
      if (typeof b.storyIndex !== 'number') {
        errors.push(`Beat ${i}: storyIndex is not a number`);
      }
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
 * @label Generate Audio
 * @color "orange"
 * @icon "hearing"
 * @input beats - Validated bulletin beats
 * @input narrate - Whether to generate audio ("true" to enable)
 * @input outputDir - Absolute path to public directory
 * @input [voice] - Kokoro voice ID (default: bm_george)
 * @output narrated - Beats with durationSeconds and optional audioPath
 */
async function generateAudio(
  beats: Array<{
    storyIndex: number;
    category: string;
    headline: string;
    narration: string;
    sentiment: string;
  }>,
  narrate: string,
  outputDir: string,
  voice?: string,
): Promise<{
  narrated: Array<{
    storyIndex: number;
    category: string;
    headline: string;
    narration: string;
    sentiment: string;
    durationSeconds: number;
    audioPath?: string;
  }>;
}> {
  if (narrate !== 'true') {
    return { narrated: beats.map((b) => ({ ...b, durationSeconds: 5 })) };
  }

  const { KokoroTTS } = await import('kokoro-js');
  const fs = await import('fs');
  const path = await import('path');

  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32' });
  const voiceId = voice || 'bm_george';

  const audioDir = path.join(outputDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const narrated = [];
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const audio = await tts.generate(beat.narration, { voice: voiceId });
    const audioDuration = audio.audio.length / audio.sampling_rate;
    const adjustedDuration = Math.round((audioDuration + 0.8) * 10) / 10;

    const fileName = `bulletin-beat-${i}.wav`;
    audio.save(path.join(audioDir, fileName));

    narrated.push({
      ...beat,
      durationSeconds: Math.max(adjustedDuration, 4),
      audioPath: `audio/${fileName}`,
    });
  }

  return { narrated };
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Plan Scenes
 * @color "cyan"
 * @icon "description"
 * @input ranked - Ranked stories with categories
 * @input thumbnails - Array of thumbnail paths indexed to match stories
 * @input beats - Narrated beats with audio and durations
 * @output manifest - Complete bulletin manifest for Remotion rendering
 */
function planScenes(
  ranked: Array<{ title: string; url: string; source: string; score: number; snippet: string; category: string }>,
  thumbnails: Array<string | null>,
  beats: Array<{
    storyIndex: number;
    category: string;
    headline: string;
    narration: string;
    sentiment: string;
    durationSeconds: number;
    audioPath?: string;
  }>,
): {
  manifest: {
    date: string;
    stories: Array<{
      title: string;
      url: string;
      source: string;
      score: number;
      snippet: string;
      category: string;
      thumbnailPath: string | null;
    }>;
    beats: typeof beats;
    totalDurationSeconds: number;
  };
} {
  const date = new Date().toISOString().split('T')[0];

  const stories = ranked.map((s, i) => ({
    ...s,
    thumbnailPath: thumbnails[i] || null,
  }));

  const beatsDuration = beats.reduce((sum, b) => sum + b.durationSeconds, 0);
  const totalDurationSeconds = beatsDuration + 4 + 3; // 4s intro + 3s outro

  return {
    manifest: {
      date,
      stories,
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
 * @description Fetches AI news from HN, Reddit, and ArXiv in parallel, deduplicates, ranks by engagement and category diversity, fetches OG thumbnails, generates TV anchor narration via an agent, validates, optionally generates TTS audio, and assembles a news bulletin manifest.
 *
 * @param outputDir - Absolute path to public directory
 * @param [narrate] - Set to "true" to generate Kokoro TTS audio
 * @param [voice] - Kokoro voice ID (default: bm_george for British male anchor)
 * @returns manifest - Complete bulletin manifest for Remotion rendering
 *
 * @position Start 0 150
 * @node hn fetchHN [position: 300 50] [color: "orange"] [icon: "search"]
 * @node reddit fetchReddit [position: 300 150] [color: "orange"] [icon: "search"]
 * @node arxiv fetchArxiv [position: 300 250] [color: "orange"] [icon: "search"]
 * @node merge mergeStories [position: 600 150] [color: "cyan"] [icon: "sort"]
 * @node rank rankStories [position: 900 150] [color: "green"] [icon: "verified"] [suppress: "UNUSED_OUTPUT_PORT"]
 * @node thumbs fetchThumbnails [position: 1200 50] [color: "cyan"] [icon: "download"]
 * @node buildPrompt buildPrompt [position: 1200 250] [color: "cyan"] [icon: "description"]
 * @node script waitForAgent [position: 1500 250] [color: "purple"] [icon: "smartToy"] [expr: agentId="'bulletin-writer'"]
 * @node parse parseScript [position: 1800 250] [color: "cyan"] [icon: "search"]
 * @node vScript validateScript [position: 2100 250] [color: "green"] [icon: "verified"] [suppress: "UNUSED_OUTPUT_PORT"]
 * @node audio generateAudio [position: 2400 250] [color: "orange"] [icon: "hearing"]
 * @node scenes planScenes [position: 2700 150] [color: "cyan"] [icon: "description"]
 * @position Exit 3000 150
 *
 * @path Start -> hn -> merge -> rank -> thumbs -> scenes -> Exit
 * @path Start -> reddit -> merge
 * @path Start -> arxiv -> merge
 * @path Start -> hn -> merge -> rank -> buildPrompt -> script -> parse -> vScript -> audio -> scenes
 * @path hn:fail -> Exit
 * @path reddit:fail -> Exit
 * @path arxiv:fail -> Exit
 * @path rank:fail -> Exit
 * @path script:fail -> Exit
 * @path vScript:fail -> Exit
 * @path audio:fail -> Exit
 *
 * @connect hn.stories -> merge.hnStories
 * @connect reddit.stories -> merge.redditStories
 * @connect arxiv.stories -> merge.arxivStories
 * @connect merge.merged -> rank.merged
 * @connect rank.ranked -> thumbs.ranked
 * @connect Start.outputDir -> thumbs.outputDir
 * @connect rank.ranked -> buildPrompt.ranked
 * @connect buildPrompt.prompt -> script.prompt
 * @connect rank.ranked -> script.context
 * @connect script.agentResult -> parse.agentResult
 * @connect parse.beats -> vScript.beats
 * @connect vScript.validatedBeats -> audio.beats
 * @connect Start.narrate -> audio.narrate
 * @connect Start.outputDir -> audio.outputDir
 * @connect Start.voice -> audio.voice
 * @connect rank.ranked -> scenes.ranked
 * @connect thumbs.thumbnails -> scenes.thumbnails
 * @connect audio.narrated -> scenes.beats
 * @connect scenes.manifest -> Exit.manifest
 */
export function aiBulletin(
  execute: boolean,
  params: {
    outputDir: string;
    narrate?: string;
    voice?: string;
  },
): {
  onSuccess: boolean;
  onFailure: boolean;
  manifest: {
    date: string;
    stories: Array<{
      title: string;
      url: string;
      source: string;
      score: number;
      snippet: string;
      category: string;
      thumbnailPath: string | null;
    }>;
    beats: Array<{
      storyIndex: number;
      category: string;
      headline: string;
      narration: string;
      sentiment: string;
      durationSeconds: number;
      audioPath?: string;
    }>;
    totalDurationSeconds: number;
  } | null;
} {
  throw new Error('Not implemented');
}
