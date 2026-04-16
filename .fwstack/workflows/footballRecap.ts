// =============================================================================
// Node Types
// =============================================================================

const COMPETITION_IDS = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'PPL', 'DED', 'CL', 'EL', 'ECL'] as const;

/**
 * @flowWeaver nodeType
 * @expression
 * @label Fetch Results
 * @color "cyan"
 * @icon "search"
 * @input date - Date in YYYY-MM-DD format
 * @input apiKey - football-data.org API key (X-Auth-Token)
 * @output competitions - Array of competition objects with matches, scores, scorers, and crest URLs
 */
async function fetchResults(
  date: string,
  apiKey: string,
): Promise<{
  competitions: Array<{
    id: string;
    name: string;
    matches: Array<{
      homeTeam: { name: string; crest: string; score: number };
      awayTeam: { name: string; crest: string; score: number };
      scorers: Array<{ player: string; minute: number; team: string }>;
    }>;
  }>;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(
      `https://api.football-data.org/v4/matches?dateFrom=${date}&dateTo=${date}`,
      {
        headers: { 'X-Auth-Token': apiKey },
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      throw new Error(`football-data.org API returned ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as {
      matches: Array<{
        competition: { code: string; name: string };
        homeTeam: { name: string; crest: string };
        awayTeam: { name: string; crest: string };
        score: { fullTime: { home: number; away: number } };
        goals: Array<{ scorer: { name: string }; minute: number; team: { name: string } }>;
      }>;
    };

    const validCodes = new Set(COMPETITION_IDS);
    const byComp = new Map<string, { id: string; name: string; matches: any[] }>();

    for (const m of data.matches) {
      if (!validCodes.has(m.competition.code)) continue;
      if (!m.score.fullTime || m.score.fullTime.home === null) continue;

      if (!byComp.has(m.competition.code)) {
        byComp.set(m.competition.code, { id: m.competition.code, name: m.competition.name, matches: [] });
      }

      byComp.get(m.competition.code)!.matches.push({
        homeTeam: { name: m.homeTeam.name, crest: m.homeTeam.crest, score: m.score.fullTime.home },
        awayTeam: { name: m.awayTeam.name, crest: m.awayTeam.crest, score: m.score.fullTime.away },
        scorers: (m.goals || []).map((g) => ({
          player: g.scorer?.name || 'Unknown',
          minute: g.minute || 0,
          team: g.team?.name || '',
        })),
      });
    }

    return { competitions: Array.from(byComp.values()) };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Fetch Images
 * @color "cyan"
 * @icon "download"
 * @input competitions - Array of competition objects with matches
 * @input outputDir - Absolute path to public directory for saving assets
 * @output playerImages - Mapping of player name to local image file path
 * @output crestImages - Mapping of team name to local crest file path
 */
async function fetchImages(
  competitions: Array<{
    id: string;
    name: string;
    matches: Array<{
      homeTeam: { name: string; crest: string; score: number };
      awayTeam: { name: string; crest: string; score: number };
      scorers: Array<{ player: string; minute: number; team: string }>;
    }>;
  }>,
  outputDir: string,
): Promise<{
  playerImages: Record<string, string>;
  crestImages: Record<string, string>;
}> {
  const fs = await import('fs');
  const path = await import('path');

  const playerDir = path.join(outputDir, 'assets', 'players');
  const crestDir = path.join(outputDir, 'assets', 'crests');
  fs.mkdirSync(playerDir, { recursive: true });
  fs.mkdirSync(crestDir, { recursive: true });

  const playerImages: Record<string, string> = {};
  const crestImages: Record<string, string> = {};

  // Collect unique players and teams
  const players = new Set<string>();
  const teams = new Map<string, string>(); // name -> crest URL

  for (const comp of competitions) {
    for (const match of comp.matches) {
      teams.set(match.homeTeam.name, match.homeTeam.crest);
      teams.set(match.awayTeam.name, match.awayTeam.crest);
      for (const scorer of match.scorers) {
        if (scorer.player && scorer.player !== 'Unknown') {
          players.add(scorer.player);
        }
      }
    }
  }

  // Download team crests
  for (const [teamName, crestUrl] of teams.entries()) {
    if (!crestUrl) continue;
    try {
      const res = await fetch(crestUrl);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const ext = crestUrl.includes('.svg') ? '.svg' : '.png';
        const safeName = teamName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const filePath = path.join(crestDir, `${safeName}${ext}`);
        fs.writeFileSync(filePath, buffer);
        crestImages[teamName] = `assets/crests/${safeName}${ext}`;
      }
    } catch {
      // Skip failed downloads
    }
  }

  // Download player photos from Wikipedia (with rate limiting)
  for (const playerName of players) {
    try {
      const encoded = encodeURIComponent(playerName.replace(/ /g, '_'));
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`);
      if (res.ok) {
        const data = await res.json() as { thumbnail?: { source: string } };
        if (data.thumbnail?.source) {
          const imgRes = await fetch(data.thumbnail.source);
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const safeName = playerName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const filePath = path.join(playerDir, `${safeName}.jpg`);
            fs.writeFileSync(filePath, buffer);
            playerImages[playerName] = `assets/players/${safeName}.jpg`;
          }
        }
      }
      // Rate limit: 1 second between Wikipedia requests
      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      // Skip failed downloads
    }
  }

  return { playerImages, crestImages };
}

/**
 * @flowWeaver nodeType
 * @label Rank Highlights
 * @color "orange"
 * @icon "sort"
 * @input competitions - Array of competition objects with matches
 * @output ranked - Enriched competitions with highlight flags and reasons, sorted by highlight count descending
 * @output errors - Validation error messages
 */
function rankHighlights(
  execute: boolean,
  competitions: Array<{
    id: string;
    name: string;
    matches: Array<{
      homeTeam: { name: string; crest: string; score: number };
      awayTeam: { name: string; crest: string; score: number };
      scorers: Array<{ player: string; minute: number; team: string }>;
    }>;
  }>,
): {
  onSuccess: boolean;
  onFailure: boolean;
  ranked: Array<{
    id: string;
    name: string;
    matches: Array<{
      homeTeam: { name: string; crest: string; score: number };
      awayTeam: { name: string; crest: string; score: number };
      scorers: Array<{ player: string; minute: number; team: string }>;
      highlight: boolean;
      highlightReason: string;
    }>;
  }> | null;
  errors: string[];
} {
  if (!execute) return { onSuccess: false, onFailure: false, ranked: null, errors: [] };

  const totalMatches = competitions.reduce((sum, c) => sum + c.matches.length, 0);
  if (totalMatches === 0) {
    return { onSuccess: false, onFailure: true, ranked: null, errors: ['No matches found for date'] };
  }

  const ranked = competitions.map((comp) => ({
    ...comp,
    matches: comp.matches.map((match) => {
      const totalGoals = match.homeTeam.score + match.awayTeam.score;
      const awayWin = match.awayTeam.score > match.homeTeam.score;

      // Count goals per player for hat trick detection
      const playerGoals = new Map<string, number>();
      for (const s of match.scorers) {
        playerGoals.set(s.player, (playerGoals.get(s.player) || 0) + 1);
      }
      const hatTrick = Array.from(playerGoals.entries()).find(([, count]) => count >= 3);

      const reasons: string[] = [];
      if (totalGoals >= 4) reasons.push('high-scoring');
      if (awayWin) reasons.push('away win');
      if (hatTrick) reasons.push(`hat trick by ${hatTrick[0]}`);

      return {
        ...match,
        highlight: reasons.length > 0,
        highlightReason: reasons.join(', ') || 'routine',
      };
    }),
  }));

  // Sort by highlight count descending
  ranked.sort((a, b) => {
    const aHighlights = a.matches.filter((m) => m.highlight).length;
    const bHighlights = b.matches.filter((m) => m.highlight).length;
    return bHighlights - aHighlights;
  });

  return { onSuccess: true, onFailure: false, ranked, errors: [] };
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Build Script Prompt
 * @color "cyan"
 * @icon "description"
 * @input ranked - Ranked competitions with highlight flags
 * @output prompt - Formatted prompt string for the script agent
 */
function buildScriptPrompt(
  ranked: Array<{
    id: string;
    name: string;
    matches: Array<{
      homeTeam: { name: string; crest: string; score: number };
      awayTeam: { name: string; crest: string; score: number };
      scorers: Array<{ player: string; minute: number; team: string }>;
      highlight: boolean;
      highlightReason: string;
    }>;
  }>,
): string {
  const lines: string[] = [];
  lines.push('Generate narration beats for a football results video recap.\n');

  for (const comp of ranked) {
    if (comp.matches.length === 0) continue;
    lines.push(`## ${comp.name} (${comp.id})`);
    for (const m of comp.matches) {
      const score = `${m.homeTeam.name} ${m.homeTeam.score} - ${m.awayTeam.score} ${m.awayTeam.name}`;
      const scorerStr = m.scorers.map((s) => `${s.player} ${s.minute}'`).join(', ');
      const hl = m.highlight ? ` [HIGHLIGHT: ${m.highlightReason}]` : '';
      lines.push(`  ${score}${hl}`);
      if (scorerStr) lines.push(`    Goals: ${scorerStr}`);
    }
    lines.push('');
  }

  lines.push('Write 1-3 narration beats per competition. Each beat:');
  lines.push('- competitionId: one of PL, PD, SA, BL1, FL1, PPL, DED, CL, EL, ECL');
  lines.push('- narration: 1-2 punchy sentences, sports commentary style, under 300 characters');
  lines.push('- mood: one of "exciting", "dramatic", "routine", "shocking"');
  lines.push('Focus on highlights. Skip competitions with only routine results unless they affect the title race.');
  lines.push('\nReturn ONLY valid JSON:\n{ "beats": [{ "competitionId": "PL", "narration": "...", "mood": "exciting" }] }');

  return lines.join('\n');
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Parse Script
 * @color "cyan"
 * @icon "search"
 * @input agentResult - Raw agent result object
 * @output beats - Parsed array of narration beats
 */
function parseScript(
  agentResult: any,
): {
  beats: Array<{
    competitionId: string;
    narration: string;
    mood: string;
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
 * @input beats - Array of narration beats to validate
 * @output validatedBeats - Validated beats array
 * @output errors - Validation error messages
 */
function validateScript(
  execute: boolean,
  beats: Array<{
    competitionId: string;
    narration: string;
    mood: string;
  }>,
): {
  onSuccess: boolean;
  onFailure: boolean;
  validatedBeats: Array<{
    competitionId: string;
    narration: string;
    mood: string;
  }> | null;
  errors: string[];
} {
  if (!execute) return { onSuccess: false, onFailure: false, validatedBeats: null, errors: [] };

  const errors: string[] = [];
  const validMoods = ['exciting', 'dramatic', 'routine', 'shocking'];
  const validCompIds = new Set(COMPETITION_IDS);

  if (!beats || beats.length < 1) {
    errors.push('Expected at least 1 beat');
  }
  if (beats && beats.length > 30) {
    errors.push(`Expected at most 30 beats, got ${beats.length}`);
  }

  if (beats) {
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      if (!validCompIds.has(beat.competitionId as any)) {
        errors.push(`Beat ${i}: competitionId "${beat.competitionId}" is not a valid competition code`);
      }
      if (!beat.narration || beat.narration.trim().length === 0) {
        errors.push(`Beat ${i}: narration is empty`);
      }
      if (beat.narration && beat.narration.length > 300) {
        errors.push(`Beat ${i}: narration exceeds 300 characters (${beat.narration.length})`);
      }
      if (!validMoods.includes(beat.mood)) {
        errors.push(`Beat ${i}: mood "${beat.mood}" is not one of ${validMoods.join(', ')}`);
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
 * @icon "volume"
 * @input beats - Validated narration beats
 * @input narrate - Whether to generate audio ("true" to enable)
 * @input outputDir - Absolute path to public directory for saving audio
 * @input [voice] - Kokoro voice ID (default: af_heart)
 * @output narrated - Beats with durationSeconds and optional audioPath
 */
async function generateAudio(
  beats: Array<{
    competitionId: string;
    narration: string;
    mood: string;
  }>,
  narrate: string,
  outputDir: string,
  voice?: string,
): Promise<{
  narrated: Array<{
    competitionId: string;
    narration: string;
    mood: string;
    durationSeconds: number;
    audioPath?: string;
  }>;
}> {
  if (narrate !== 'true') {
    return {
      narrated: beats.map((b) => ({ ...b, durationSeconds: 4 })),
    };
  }

  const { KokoroTTS } = await import('kokoro-js');
  const fs = await import('fs');
  const path = await import('path');

  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32' });
  const voiceId = voice || 'af_heart';

  const audioDir = path.join(outputDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const narrated = [];
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const audio = await tts.generate(beat.narration, { voice: voiceId });
    const audioDuration = audio.audio.length / audio.sampling_rate;
    const adjustedDuration = Math.round((audioDuration + 0.5) * 10) / 10;

    const fileName = `recap-beat-${i}.wav`;
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
 * @input date - Date string
 * @input ranked - Ranked competitions with match data
 * @input beats - Narrated beats with audio paths and durations
 * @input playerImages - Player name to image path mapping
 * @input crestImages - Team name to crest path mapping
 * @output manifest - Complete manifest for Remotion rendering
 */
function planScenes(
  date: string,
  ranked: Array<{
    id: string;
    name: string;
    matches: Array<{
      homeTeam: { name: string; crest: string; score: number };
      awayTeam: { name: string; crest: string; score: number };
      scorers: Array<{ player: string; minute: number; team: string }>;
      highlight: boolean;
      highlightReason: string;
    }>;
  }>,
  beats: Array<{
    competitionId: string;
    narration: string;
    mood: string;
    durationSeconds: number;
    audioPath?: string;
  }>,
  playerImages: Record<string, string>,
  crestImages: Record<string, string>,
): {
  manifest: {
    date: string;
    competitions: typeof ranked;
    beats: typeof beats;
    playerImages: typeof playerImages;
    crestImages: typeof crestImages;
    totalDurationSeconds: number;
  };
} {
  const beatsDuration = beats.reduce((sum, b) => sum + b.durationSeconds, 0);
  const totalDurationSeconds = beatsDuration + 5 + 3; // 5s intro + 3s outro

  return {
    manifest: {
      date,
      competitions: ranked,
      beats,
      playerImages,
      crestImages,
      totalDurationSeconds,
    },
  };
}

// =============================================================================
// Workflow
// =============================================================================

/**
 * @flowWeaver workflow
 * @description Fetches daily European football results, downloads images, ranks highlights, generates narration via agent, validates script, optionally generates TTS audio, and assembles a Remotion manifest.
 *
 * @param date - Date in YYYY-MM-DD format
 * @param apiKey - football-data.org API key
 * @param outputDir - Absolute path to public directory
 * @param [narrate] - Set to "true" to generate Kokoro TTS audio
 * @param [voice] - Kokoro voice ID (default: af_heart)
 * @returns manifest - Complete manifest for Remotion rendering
 *
 * @position Start 0 150
 * @node fetch fetchResults [position: 300 150] [color: "cyan"] [icon: "search"]
 * @node images fetchImages [position: 600 50] [color: "cyan"] [icon: "download"]
 * @node rank rankHighlights [position: 600 250] [color: "orange"] [icon: "sort"] [suppress: "UNUSED_OUTPUT_PORT"]
 * @node buildPrompt buildScriptPrompt [position: 900 150] [color: "cyan"] [icon: "description"]
 * @node script waitForAgent [position: 1200 150] [color: "purple"] [icon: "smartToy"] [expr: agentId="'script-writer'"]
 * @node parse parseScript [position: 1500 150] [color: "cyan"] [icon: "search"]
 * @node vScript validateScript [position: 1800 150] [color: "green"] [icon: "verified"] [suppress: "UNUSED_OUTPUT_PORT"]
 * @node audio generateAudio [position: 2100 150] [color: "orange"] [icon: "hearing"]
 * @node scenes planScenes [position: 2400 150] [color: "cyan"] [icon: "description"]
 * @position Exit 2700 150
 *
 * @path Start -> fetch -> images -> scenes -> Exit
 * @path Start -> fetch -> rank -> buildPrompt -> script -> parse -> vScript -> audio -> scenes
 * @path fetch:fail -> Exit
 * @path images:fail -> Exit
 * @path rank:fail -> Exit
 * @path script:fail -> Exit
 * @path vScript:fail -> Exit
 * @path audio:fail -> Exit
 *
 * @connect Start.date -> fetch.date
 * @connect Start.apiKey -> fetch.apiKey
 * @connect fetch.competitions -> images.competitions
 * @connect Start.outputDir -> images.outputDir
 * @connect fetch.competitions -> rank.competitions
 * @connect rank.ranked -> buildPrompt.ranked
 * @connect buildPrompt.prompt -> script.prompt
 * @connect rank.ranked -> script.context
 * @connect script.agentResult -> parse.agentResult
 * @connect parse.beats -> vScript.beats
 * @connect vScript.validatedBeats -> audio.beats
 * @connect Start.narrate -> audio.narrate
 * @connect Start.outputDir -> audio.outputDir
 * @connect Start.voice -> audio.voice
 * @connect Start.date -> scenes.date
 * @connect rank.ranked -> scenes.ranked
 * @connect audio.narrated -> scenes.beats
 * @connect images.playerImages -> scenes.playerImages
 * @connect images.crestImages -> scenes.crestImages
 * @connect scenes.manifest -> Exit.manifest
 */
export function footballRecap(
  execute: boolean,
  params: {
    date: string;
    apiKey: string;
    outputDir: string;
    narrate?: string;
    voice?: string;
  },
): {
  onSuccess: boolean;
  onFailure: boolean;
  manifest: {
    date: string;
    competitions: Array<{
      id: string;
      name: string;
      matches: Array<{
        homeTeam: { name: string; crest: string; score: number };
        awayTeam: { name: string; crest: string; score: number };
        scorers: Array<{ player: string; minute: number; team: string }>;
        highlight: boolean;
        highlightReason: string;
      }>;
    }>;
    beats: Array<{
      competitionId: string;
      narration: string;
      mood: string;
      durationSeconds: number;
      audioPath?: string;
    }>;
    playerImages: Record<string, string>;
    crestImages: Record<string, string>;
    totalDurationSeconds: number;
  } | null;
} {
  throw new Error('Not implemented');
}
