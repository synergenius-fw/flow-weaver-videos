import { z } from 'zod';

export const CATEGORIES = [
  'new-model', 'regulation', 'funding', 'open-source',
  'research', 'controversy', 'product', 'intro', 'outro',
] as const;

export const SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed'] as const;

export const StorySchema = z.object({
  title: z.string(),
  url: z.string(),
  source: z.string(),
  score: z.number(),
  snippet: z.string(),
  category: z.string(),
  thumbnailPath: z.string().nullable(),
});

export const BeatSchema = z.object({
  storyIndex: z.number(),
  category: z.string(),
  headline: z.string(),
  narration: z.string(),
  sentiment: z.string(),
  durationSeconds: z.number(),
  audioPath: z.string().optional(),
});

export const BulletinManifestSchema = z.object({
  date: z.string(),
  stories: z.array(StorySchema),
  beats: z.array(BeatSchema),
  totalDurationSeconds: z.number(),
});

export type Story = z.infer<typeof StorySchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type BulletinManifest = z.infer<typeof BulletinManifestSchema>;

/** Category display config */
export const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  'new-model': { label: 'NEW MODEL', color: '#3b82f6', icon: '🚀' },
  'regulation': { label: 'REGULATION', color: '#ef4444', icon: '⚖️' },
  'funding': { label: 'FUNDING', color: '#22c55e', icon: '💰' },
  'open-source': { label: 'OPEN SOURCE', color: '#a855f7', icon: '🔓' },
  'research': { label: 'RESEARCH', color: '#06b6d4', icon: '🔬' },
  'controversy': { label: 'CONTROVERSY', color: '#f97316', icon: '⚡' },
  'product': { label: 'PRODUCT', color: '#14b8a6', icon: '📱' },
  'intro': { label: '', color: '#e63946', icon: '' },
  'outro': { label: '', color: '#e63946', icon: '' },
};

/** Sentiment colors */
export const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  negative: '#ef4444',
  neutral: '#94a3b8',
  mixed: '#f59e0b',
};

/** Broadcast brand colors */
export const BRAND = {
  navy: '#0d1b2a',
  darkNavy: '#070f18',
  red: '#e63946',
  gold: '#fbbf24',
  white: '#ffffff',
  gray: '#94a3b8',
  lightGray: '#cbd5e1',
} as const;
