import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeWorkflowFromFile } from '@synergenius/flow-weaver/executor';
import * as path from 'node:path';

const WORKFLOW_PATH = path.resolve(__dirname, '../.fwstack/workflows/paintingExplorer.ts');

const VALID_REGIONS = [
  { id: 'plato-aristotle', label: 'Plato and Aristotle', description: 'Central figures debating', bbox: { x: 38, y: 20, width: 24, height: 45 } },
  { id: 'euclid', label: 'Euclid', description: 'Demonstrating geometry', bbox: { x: 62, y: 55, width: 18, height: 30 } },
  { id: 'heraclitus', label: 'Heraclitus', description: 'Brooding figure on steps', bbox: { x: 35, y: 55, width: 12, height: 25 } },
  { id: 'pythagoras', label: 'Pythagoras', description: 'Writing in a book', bbox: { x: 10, y: 50, width: 18, height: 30 } },
];

const VALID_BEATS = [
  { regionId: 'overview', narration: 'One painting, fifty philosophers.', durationSeconds: 5, zoom: 1, mood: 'epic' },
  { regionId: 'plato-aristotle', narration: 'At the center: the argument that started everything.', durationSeconds: 5, zoom: 2.2, mood: 'dramatic' },
  { regionId: 'heraclitus', narration: 'Sitting alone, ignoring everyone.', durationSeconds: 5, zoom: 2.8, mood: 'mysterious' },
  { regionId: 'pythagoras', narration: 'Deep in his notebook.', durationSeconds: 5, zoom: 2.5, mood: 'reverent' },
  { regionId: 'euclid', narration: 'Drawing a perfect circle.', durationSeconds: 5, zoom: 2.5, mood: 'reverent' },
  { regionId: 'overview', narration: 'Every figure here shaped the world.', durationSeconds: 5, zoom: 1, mood: 'epic' },
];

const BASE_PARAMS = {
  imagePath: 'images/school-of-athens.jpg',
  imageBase64: 'dGVzdA==',
  imageMediaType: 'image/jpeg',
  imageWidth: 3820,
  imageHeight: 2964,
};

function setMocks(mocks: Record<string, unknown>) {
  (globalThis as Record<string, unknown>).__fw_mocks__ = mocks;
}

beforeEach(() => { delete (globalThis as Record<string, unknown>).__fw_mocks__; });
afterEach(() => { delete (globalThis as Record<string, unknown>).__fw_mocks__; });

describe('paintingExplorer workflow', () => {
  it('should produce a valid manifest on happy path', async () => {
    setMocks({
      agents: {
        analyzeImage: {
          title: 'The School of Athens',
          artist: 'Raphael',
          year: '1509-1511',
          regions: VALID_REGIONS,
        },
        generateStory: {
          beats: VALID_BEATS,
        },
      },
    });

    const { result } = await executeWorkflowFromFile(
      WORKFLOW_PATH,
      BASE_PARAMS,
      { workflowName: 'paintingExplorer' },
    );
    const r = result as Record<string, unknown>;
    expect(r.onSuccess).toBe(true);

    const manifest = r.manifest as Record<string, unknown>;
    expect(manifest.title).toBe('The School of Athens');
    expect(manifest.artist).toBe('Raphael');
    expect(manifest.imagePath).toBe('images/school-of-athens.jpg');
    expect(manifest.imageWidth).toBe(3820);
    expect(manifest.totalDurationSeconds).toBe(30);
    expect((manifest.regions as unknown[]).length).toBe(4);
    expect((manifest.beats as unknown[]).length).toBe(6);
  });

  it('should fail when regions are invalid (too few)', async () => {
    setMocks({
      agents: {
        analyzeImage: {
          title: 'Test',
          artist: 'Test',
          year: '2000',
          regions: [
            { id: 'a', label: 'A', description: 'Only one region', bbox: { x: 10, y: 10, width: 20, height: 20 } },
          ],
        },
      },
    });

    const { result } = await executeWorkflowFromFile(
      WORKFLOW_PATH,
      BASE_PARAMS,
      { workflowName: 'paintingExplorer' },
    );
    const r = result as Record<string, unknown>;
    expect(r.onSuccess).toBe(false);
  });

  it('should fail when story beats have invalid structure', async () => {
    setMocks({
      agents: {
        analyzeImage: {
          title: 'Test',
          artist: 'Test',
          year: '2000',
          regions: VALID_REGIONS,
        },
        generateStory: {
          beats: [
            { regionId: 'plato-aristotle', narration: 'No overview start.', durationSeconds: 5, zoom: 2, mood: 'dramatic' },
            { regionId: 'overview', narration: 'End.', durationSeconds: 5, zoom: 1, mood: 'epic' },
          ],
        },
      },
    });

    const { result } = await executeWorkflowFromFile(
      WORKFLOW_PATH,
      BASE_PARAMS,
      { workflowName: 'paintingExplorer' },
    );
    const r = result as Record<string, unknown>;
    expect(r.onSuccess).toBe(false);
  });
});
