import { z } from 'zod';

export const MatchSchema = z.object({
  homeTeam: z.object({
    name: z.string(),
    crest: z.string(),
    score: z.number(),
  }),
  awayTeam: z.object({
    name: z.string(),
    crest: z.string(),
    score: z.number(),
  }),
  scorers: z.array(
    z.object({
      player: z.string(),
      minute: z.number(),
      team: z.string(),
    }),
  ),
  highlight: z.boolean(),
  highlightReason: z.string(),
});

export const CompetitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  matches: z.array(MatchSchema),
});

export const BeatSchema = z.object({
  competitionId: z.string(),
  narration: z.string(),
  mood: z.enum(['exciting', 'dramatic', 'routine', 'shocking']),
  durationSeconds: z.number(),
  audioPath: z.string().optional(),
});

export const RecapManifestSchema = z.object({
  date: z.string(),
  competitions: z.array(CompetitionSchema),
  beats: z.array(BeatSchema),
  playerImages: z.record(z.string()),
  crestImages: z.record(z.string()),
  matchClips: z.record(z.string()).optional(),
  stadiumImages: z.record(z.string()).optional(),
  totalDurationSeconds: z.number(),
});

export type Match = z.infer<typeof MatchSchema>;
export type Competition = z.infer<typeof CompetitionSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type RecapManifest = z.infer<typeof RecapManifestSchema>;

/** League brand colors */
export const LEAGUE_COLORS: Record<string, { primary: string; secondary: string }> = {
  PL: { primary: '#3d195b', secondary: '#00ff85' },
  PD: { primary: '#ee8707', secondary: '#ffffff' },
  SA: { primary: '#024494', secondary: '#009b3a' },
  BL1: { primary: '#d20515', secondary: '#ffffff' },
  FL1: { primary: '#091c3e', secondary: '#daff00' },
  PPL: { primary: '#00543d', secondary: '#ffffff' },
  DED: { primary: '#e8532c', secondary: '#ffffff' },
  CL: { primary: '#0d1541', secondary: '#f7c600' },
  EL: { primary: '#f26122', secondary: '#000000' },
  ECL: { primary: '#01a650', secondary: '#000000' },
};

export const MOOD_COLORS: Record<string, string> = {
  exciting: '#00ff85',
  dramatic: '#ff4444',
  routine: '#888888',
  shocking: '#ff00ff',
};
