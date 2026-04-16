// =============================================================================
// Node Types
// =============================================================================

const COMPETITION_IDS = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'PPL', 'DED', 'CL', 'EL', 'ECL'] as const;

// Competitions and which days they typically play (0=Sun, 1=Mon, ..., 6=Sat)
const COMP_SCHEDULE: Record<string, number[]> = {
  PL: [0, 1, 2, 3, 5, 6],    // Sat-Mon mostly, occasional midweek
  PD: [0, 1, 2, 5, 6],
  SA: [0, 1, 2, 5, 6],
  BL1: [0, 2, 5, 6],
  FL1: [0, 2, 5, 6],
  PPL: [0, 1, 2, 5, 6],
  DED: [0, 2, 5, 6],
  CL: [2, 3],                  // Tue-Wed
  EL: [4],                     // Thu
  ECL: [4],                    // Thu
};

/**
 * @flowWeaver nodeType
 * @expression
 * @label Fetch Results
 * @color "cyan"
 * @icon "search"
 * @input date - Date in YYYY-MM-DD format, or "latest" to auto-detect the most recent matchday
 * @input apiKey - football-data.org API key (X-Auth-Token)
 * @output competitions - Array of competition objects with matches, scores, scorers, and crest URLs
 * @output resolvedDate - The actual date used (resolved from "latest" or passed through)
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
  resolvedDate: string;
}> {
  const compNames: Record<string, string> = {
    PL: 'Premier League', PD: 'La Liga', SA: 'Serie A',
    BL1: 'Bundesliga', FL1: 'Ligue 1', PPL: 'Primeira Liga',
    DED: 'Eredivisie', CL: 'Champions League', EL: 'Europa League',
    ECL: 'Conference League',
  };

  // Auto-detect latest matchday: scan backwards from today up to 7 days
  let targetDate = date;
  if (!date || date === 'latest') {
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();

      // Pick a competition likely to have matches on this day
      const testComp = Object.entries(COMP_SCHEDULE).find(([, days]) => days.includes(dayOfWeek));
      if (!testComp) continue;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(
          `https://api.football-data.org/v4/competitions/${testComp[0]}/matches?dateFrom=${ds}&dateTo=${ds}&status=FINISHED`,
          { headers: { 'X-Auth-Token': apiKey }, signal: controller.signal },
        );
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json() as { matches?: unknown[] };
          if (data.matches && data.matches.length > 0) {
            targetDate = ds;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 6500));
      } catch { /* continue scanning */ }
    }
    if (!targetDate || targetDate === 'latest') {
      throw new Error('No finished matches found in the last 7 days');
    }
  }

  const resolvedDate = targetDate;
  const dayOfWeek = new Date(resolvedDate + 'T12:00:00Z').getDay();

  // Only query competitions likely to have matches on this day of week
  const activeComps = Object.entries(COMP_SCHEDULE)
    .filter(([, days]) => days.includes(dayOfWeek))
    .map(([code]) => code);

  const byComp = new Map<string, { id: string; name: string; matches: any[] }>();

  for (const code of activeComps) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(
        `https://api.football-data.org/v4/competitions/${code}/matches?dateFrom=${resolvedDate}&dateTo=${resolvedDate}&status=FINISHED`,
        { headers: { 'X-Auth-Token': apiKey }, signal: controller.signal },
      );
      clearTimeout(timeout);

      if (!res.ok) continue;

      const data = await res.json() as {
        matches: Array<{
          competition: { code: string; name: string };
          homeTeam: { name: string; crest: string };
          awayTeam: { name: string; crest: string };
          score: { fullTime: { home: number; away: number } };
          goals: Array<{ scorer: { name: string }; minute: number; team: { name: string } }> | null;
        }>;
      };

      for (const m of data.matches || []) {
        if (!m.score?.fullTime || m.score.fullTime.home === null) continue;

        if (!byComp.has(code)) {
          byComp.set(code, { id: code, name: m.competition?.name || compNames[code], matches: [] });
        }

        byComp.get(code)!.matches.push({
          homeTeam: { name: m.homeTeam.name, crest: m.homeTeam.crest, score: m.score.fullTime.home },
          awayTeam: { name: m.awayTeam.name, crest: m.awayTeam.crest, score: m.score.fullTime.away },
          scorers: (m.goals || [])
            .filter((g) => g.scorer?.name)
            .map((g) => ({
              player: g.scorer.name,
              minute: g.minute || 0,
              team: g.team?.name || '',
            })),
        });
      }

      // Rate limit: free tier 10 req/min
      await new Promise((r) => setTimeout(r, 6500));
    } catch {
      // Skip failed competitions
    }
  }

  if (byComp.size === 0) {
    throw new Error(`No finished matches found for ${resolvedDate} across ${activeComps.length} competitions`);
  }

  return { competitions: Array.from(byComp.values()), resolvedDate };
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
 * @output stadiumImages - Mapping of competition ID to a stadium/match atmosphere photo path
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
  stadiumImages: Record<string, string>;
}> {
  const fs = await import('fs');
  const path = await import('path');

  const playerDir = path.join(outputDir, 'assets', 'players');
  const crestDir = path.join(outputDir, 'assets', 'crests');
  fs.mkdirSync(playerDir, { recursive: true });
  fs.mkdirSync(crestDir, { recursive: true });

  const playerImages: Record<string, string> = {};
  const crestImages: Record<string, string> = {};

  const players = new Set<string>();
  const teams = new Map<string, string>();

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

  // Download team crests (skip if already cached)
  for (const [teamName, crestUrl] of teams.entries()) {
    if (!crestUrl) continue;
    const ext = crestUrl.includes('.svg') ? '.svg' : '.png';
    const safeName = teamName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filePath = path.join(crestDir, `${safeName}${ext}`);
    const relPath = `assets/crests/${safeName}${ext}`;

    if (fs.existsSync(filePath)) {
      crestImages[teamName] = relPath;
      continue;
    }

    try {
      const res = await fetch(crestUrl);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        crestImages[teamName] = relPath;
      }
    } catch { /* skip */ }
  }

  // Download player photos from Wikipedia (with rate limiting, skip cached)
  for (const playerName of players) {
    const safeName = playerName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filePath = path.join(playerDir, `${safeName}.jpg`);
    const relPath = `assets/players/${safeName}.jpg`;

    if (fs.existsSync(filePath)) {
      playerImages[playerName] = relPath;
      continue;
    }

    try {
      const encoded = encodeURIComponent(playerName.replace(/ /g, '_'));
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
        headers: { 'User-Agent': 'flow-weaver-videos/1.0 (football-recap)' },
      });
      if (res.ok) {
        const data = await res.json() as { thumbnail?: { source: string } };
        if (data.thumbnail?.source) {
          const imgRes = await fetch(data.thumbnail.source);
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(filePath, buffer);
            playerImages[playerName] = relPath;
          }
        }
      }
      await new Promise((r) => setTimeout(r, 1500));
    } catch { /* skip */ }
  }

  // Download stadium/atmosphere images per competition from Unsplash (free, CC0)
  const stadiumDir = path.join(outputDir, 'assets', 'stadiums');
  fs.mkdirSync(stadiumDir, { recursive: true });
  const stadiumImages: Record<string, string> = {};

  const stadiumQueries: Record<string, string> = {
    PL: 'premier league stadium football',
    PD: 'la liga stadium football spain',
    SA: 'serie a stadium football italy',
    BL1: 'bundesliga stadium football germany',
    FL1: 'ligue 1 stadium football france',
    PPL: 'portugal football stadium',
    DED: 'eredivisie football stadium netherlands',
    CL: 'champions league stadium night',
    EL: 'europa league football stadium',
    ECL: 'football stadium night',
  };

  for (const comp of competitions) {
    const filePath = path.join(stadiumDir, `${comp.id.toLowerCase()}.jpg`);
    const relPath = `assets/stadiums/${comp.id.toLowerCase()}.jpg`;

    if (fs.existsSync(filePath)) {
      stadiumImages[comp.id] = relPath;
      continue;
    }

    try {
      const query = encodeURIComponent(stadiumQueries[comp.id] || 'football stadium');
      // Unsplash Source API — returns a random photo matching the query, no API key needed
      const res = await fetch(`https://source.unsplash.com/1280x720/?${query}`, { redirect: 'follow' });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        // Only save if we got a real image (not a tiny error response)
        if (buffer.length > 10000) {
          fs.writeFileSync(filePath, buffer);
          stadiumImages[comp.id] = relPath;
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    } catch { /* skip */ }
  }

  return { playerImages, crestImages, stadiumImages };
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
    return { onSuccess: false, onFailure: true, ranked: null, errors: ['No matches found for date — pipeline cannot continue'] };
  }

  const ranked = competitions.map((comp) => ({
    ...comp,
    matches: comp.matches.map((match) => {
      const totalGoals = match.homeTeam.score + match.awayTeam.score;
      const awayWin = match.awayTeam.score > match.homeTeam.score;

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
 * @input resolvedDate - The actual date being recapped
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
  resolvedDate: string,
): string {
  const lines: string[] = [];
  lines.push(`Generate narration beats for a football results video recap for ${resolvedDate}.\n`);

  for (const comp of ranked) {
    if (comp.matches.length === 0) continue;
    lines.push(`## ${comp.name} (${comp.id})`);
    for (const m of comp.matches) {
      const score = `${m.homeTeam.name} ${m.homeTeam.score} - ${m.awayTeam.score} ${m.awayTeam.name}`;
      const scorerStr = m.scorers.length > 0
        ? m.scorers.map((s) => `${s.player} ${s.minute}'`).join(', ')
        : '';
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
 * @label Fetch Clips
 * @color "red"
 * @icon "play"
 * @input competitions - Array of competition objects with matches
 * @input resolvedDate - Resolved date string for search context
 * @input outputDir - Absolute path to public directory for saving clips
 * @output matchClips - Mapping of "homeTeam vs awayTeam" to local clip file path (relative to public/)
 */
async function fetchClips(
  competitions: Array<{
    id: string;
    name: string;
    matches: Array<{
      homeTeam: { name: string; crest: string; score: number };
      awayTeam: { name: string; crest: string; score: number };
      scorers: Array<{ player: string; minute: number; team: string }>;
    }>;
  }>,
  resolvedDate: string,
  outputDir: string,
): Promise<{
  matchClips: Record<string, string>;
}> {
  const { execSync } = await import('child_process');
  const fs = await import('fs');
  const path = await import('path');

  const clipsDir = path.join(outputDir, 'assets', 'clips');
  fs.mkdirSync(clipsDir, { recursive: true });

  // Official league channels — primary source for clips
  const OFFICIAL_CHANNELS = new Set([
    'UCG5qGWdu8nIRZqJ_GgDwQ-w', // Premier League
    'UCTv-XvfzLX3i4IGWAm4sbmA', // La Liga
    'UCBJeMCIeLQos7wacox4hmLQ', // Serie A
    'UC6UL29enLNe4mqwTfAyeNuw', // Bundesliga
    'UCQsH5XtIc9hONE1BQjucM0g', // Ligue 1
    'UCyGa1YEx9ST66rYrJTGIKOw', // UEFA
  ]);

  function shortName(name: string): string {
    return name
      .replace(/\b(FC|CF|AFC|SC|OSC|HSC|SSC|ACF|SL|AS|RC)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // League name keywords for channel matching
  const LEAGUE_KEYWORDS = ['premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1',
    'primeira liga', 'eredivisie', 'champions league', 'europa league', 'conference league',
    'uefa', 'football', 'soccer', 'futbol', 'calcio'];

  function isAcceptableChannel(channelId: string, channelName: string, videoTitle: string, home: string, away: string): boolean {
    if (OFFICIAL_CHANNELS.has(channelId)) return true;

    const chLower = channelName.toLowerCase();
    const titleLower = videoTitle.toLowerCase();
    const homeLower = home.toLowerCase();
    const awayLower = away.toLowerCase();

    // Accept club channels whose name contains a team name
    if (chLower.includes(homeLower) || chLower.includes(awayLower)) return true;
    // Accept channels with "official" in the name
    if (chLower.includes('official')) return true;
    // Accept if channel name contains a league keyword
    if (LEAGUE_KEYWORDS.some((kw) => chLower.includes(kw))) return true;
    // Accept if video title contains "highlights" and a team name (likely a legit recap)
    if (titleLower.includes('highlight') && (titleLower.includes(homeLower) || titleLower.includes(awayLower))) return true;

    return false;
  }

  const matchClips: Record<string, string> = {};

  for (const comp of competitions) {
    for (const match of comp.matches) {
      const key = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
      const safeName = key.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const outFile = path.join(clipsDir, `${safeName}.mp4`);
      const relPath = `assets/clips/${safeName}.mp4`;

      if (fs.existsSync(outFile)) {
        matchClips[key] = relPath;
        continue;
      }

      try {
        const home = shortName(match.homeTeam.name);
        const away = shortName(match.awayTeam.name);
        const query = `${home} ${away} highlights ${resolvedDate}`;

        // Search 10 results, get channel ID + channel name + video title + video ID
        const searchResult = execSync(
          `yt-dlp --print "%(channel_id)s\t%(channel)s\t%(title)s\t%(id)s" "ytsearch10:${query}" --no-download --no-warnings`,
          { timeout: 30000, stdio: 'pipe', encoding: 'utf-8' },
        ).trim();

        const lines = searchResult.split('\n').filter(Boolean);
        let videoId = '';

        // Pass 1: prefer official league channels
        for (const line of lines) {
          const parts = line.split('\t');
          const chId = parts[0];
          if (OFFICIAL_CHANNELS.has(chId)) {
            videoId = parts[3];
            break;
          }
        }

        // Pass 2: try acceptable channels (clubs, league-named, highlight videos)
        if (!videoId) {
          for (const line of lines) {
            const parts = line.split('\t');
            const [chId, chName, title, vId] = parts;
            if (isAcceptableChannel(chId, chName || '', title || '', home, away)) {
              videoId = vId;
              break;
            }
          }
        }

        // Do NOT fall back to random channels — skip the match
        if (videoId) {
          // Download 15 seconds at 720p, starting at 0:15 (past intros/logos)
          execSync(
            `yt-dlp -f "best[height<=720]" --download-sections "*0:15-0:30" -o "${outFile}" "https://www.youtube.com/watch?v=${videoId}" --no-warnings`,
            { timeout: 60000, stdio: 'pipe' },
          );
          if (fs.existsSync(outFile)) {
            matchClips[key] = relPath;
          }
        }
      } catch {
        // Skip matches where no clip could be downloaded
      }
    }
  }

  return { matchClips };
}

/**
 * @flowWeaver nodeType
 * @expression
 * @label Plan Scenes
 * @color "cyan"
 * @icon "description"
 * @input resolvedDate - The actual date being recapped
 * @input ranked - Ranked competitions with match data
 * @input beats - Narrated beats with audio paths and durations
 * @input playerImages - Player name to image path mapping
 * @input crestImages - Team name to crest path mapping
 * @input matchClips - Match key to clip file path mapping
 * @input stadiumImages - Competition ID to stadium photo path mapping
 * @output manifest - Complete manifest for Remotion rendering
 */
function planScenes(
  resolvedDate: string,
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
  matchClips: Record<string, string>,
  stadiumImages: Record<string, string>,
): {
  manifest: {
    date: string;
    competitions: typeof ranked;
    beats: typeof beats;
    playerImages: typeof playerImages;
    crestImages: typeof crestImages;
    matchClips: typeof matchClips;
    stadiumImages: typeof stadiumImages;
    totalDurationSeconds: number;
  };
} {
  const beatsDuration = beats.reduce((sum, b) => sum + b.durationSeconds, 0);
  const totalDurationSeconds = beatsDuration + 5 + 3; // 5s intro + 3s outro

  return {
    manifest: {
      date: resolvedDate,
      competitions: ranked,
      beats,
      playerImages,
      crestImages,
      matchClips,
      stadiumImages,
      totalDurationSeconds,
    },
  };
}

// =============================================================================
// Workflow
// =============================================================================

/**
 * @flowWeaver workflow
 * @description Fetches daily European football results (auto-detecting latest matchday), downloads images and highlight clips from verified channels, ranks highlights, generates narration via agent, validates script, optionally generates TTS audio, and assembles a Remotion manifest.
 *
 * @param date - Date in YYYY-MM-DD format, or "latest" to auto-detect most recent matchday
 * @param apiKey - football-data.org API key
 * @param outputDir - Absolute path to public directory
 * @param [narrate] - Set to "true" to generate Kokoro TTS audio
 * @param [voice] - Kokoro voice ID (default: af_heart)
 * @returns manifest - Complete manifest for Remotion rendering
 *
 * @position Start 0 150
 * @node fetch fetchResults [position: 300 150] [color: "cyan"] [icon: "search"]
 * @node images fetchImages [position: 600 50] [color: "cyan"] [icon: "download"]
 * @node clips fetchClips [position: 600 150] [color: "red"] [icon: "play"]
 * @node rank rankHighlights [position: 600 300] [color: "orange"] [icon: "sort"] [suppress: "UNUSED_OUTPUT_PORT"]
 * @node buildPrompt buildScriptPrompt [position: 900 300] [color: "cyan"] [icon: "description"]
 * @node script waitForAgent [position: 1200 300] [color: "purple"] [icon: "smartToy"] [expr: agentId="'script-writer'"]
 * @node parse parseScript [position: 1500 300] [color: "cyan"] [icon: "search"]
 * @node vScript validateScript [position: 1800 300] [color: "green"] [icon: "verified"] [suppress: "UNUSED_OUTPUT_PORT"]
 * @node audio generateAudio [position: 2100 300] [color: "orange"] [icon: "hearing"]
 * @node scenes planScenes [position: 2400 150] [color: "cyan"] [icon: "description"]
 * @position Exit 2700 150
 *
 * @path Start -> fetch -> images -> scenes -> Exit
 * @path Start -> fetch -> clips -> scenes
 * @path Start -> fetch -> rank -> buildPrompt -> script -> parse -> vScript -> audio -> scenes
 * @path fetch:fail -> Exit
 * @path images:fail -> Exit
 * @path clips:fail -> Exit
 * @path rank:fail -> Exit
 * @path script:fail -> Exit
 * @path vScript:fail -> Exit
 * @path audio:fail -> Exit
 *
 * @connect Start.date -> fetch.date
 * @connect Start.apiKey -> fetch.apiKey
 * @connect fetch.competitions -> images.competitions
 * @connect Start.outputDir -> images.outputDir
 * @connect fetch.competitions -> clips.competitions
 * @connect fetch.resolvedDate -> clips.resolvedDate
 * @connect Start.outputDir -> clips.outputDir
 * @connect fetch.competitions -> rank.competitions
 * @connect rank.ranked -> buildPrompt.ranked
 * @connect fetch.resolvedDate -> buildPrompt.resolvedDate
 * @connect buildPrompt.prompt -> script.prompt
 * @connect rank.ranked -> script.context
 * @connect script.agentResult -> parse.agentResult
 * @connect parse.beats -> vScript.beats
 * @connect vScript.validatedBeats -> audio.beats
 * @connect Start.narrate -> audio.narrate
 * @connect Start.outputDir -> audio.outputDir
 * @connect Start.voice -> audio.voice
 * @connect fetch.resolvedDate -> scenes.resolvedDate
 * @connect rank.ranked -> scenes.ranked
 * @connect audio.narrated -> scenes.beats
 * @connect images.playerImages -> scenes.playerImages
 * @connect images.crestImages -> scenes.crestImages
 * @connect clips.matchClips -> scenes.matchClips
 * @connect images.stadiumImages -> scenes.stadiumImages
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
    matchClips: Record<string, string>;
    stadiumImages: Record<string, string>;
    totalDurationSeconds: number;
  } | null;
} {
  throw new Error('Not implemented');
}
