# flow-weaver-videos

AI-powered video generation built on [Flow Weaver](https://github.com/synergenius-fw/flow-weaver) and [Remotion](https://remotion.dev).

Feed in data — images, APIs, documents — and Flow Weaver workflows analyze, narrate, and compose videos programmatically. Each video type is a workflow + a Remotion composition. The workflow does the thinking; Remotion does the rendering.

## Painting Explorer

The first video type. Drop in a painting, get back a narrated video that pans and zooms through regions of interest.

**How it works:**

```
Image → [Claude Vision] → Regions → [Gate] → [Claude] → Story Beats → [Gate] → Scene Manifest → [Remotion] → MP4
```

The Flow Weaver workflow (`paintingExplorer`) runs 5 nodes:

| Node | Type | What it does |
|------|------|-------------|
| **analyzeImage** | LLM (Claude Vision) | Identifies 4-8 regions of interest with bounding boxes, extracts title/artist/year |
| **validateRegions** | Gate | Rejects if <4 or >8 regions, duplicate IDs, invalid bounding boxes, or regions too small to zoom into |
| **generateStory** | LLM (Claude) | Creates 6-8 narrative beats (30-40s total) mapped to regions, with mood tags and zoom levels |
| **validateStory** | Gate | Rejects if beats don't start/end with overview, durations outside 4-6s, invalid moods, or bad total length |
| **planScenes** | Deterministic | Assembles the final SceneManifest combining image metadata, regions, and beats |

The Remotion composition reads the manifest and renders:
- Ken Burns pan/zoom across the high-res painting using a virtual Camera
- Subtitle narration synced to camera movement with fade transitions
- Region highlights that follow the camera focus

## Quick Start

```bash
npm install

# Preview with the bundled sample (The School of Athens) — no API key needed
npm run studio

# Generate a manifest from your own painting
ANTHROPIC_API_KEY=sk-... npm run generate -- path/to/painting.jpg

# Render to MP4
npm run render:painting
```

## Project Structure

```
src/
├── Root.tsx                          # Remotion composition registry
├── lib/                              # Animation springs, timing, colors
├── components/                       # Camera, Scene, Title (reusable across video types)
├── env/                              # Fonts and global styles
├── videos/
│   └── painting-explorer/            # Remotion composition + types + sample data
└── workflows/
    └── painting-explorer/
        └── generate.ts               # Standalone generation script

.fwstack/
└── workflows/
    └── paintingExplorer.ts           # Flow Weaver workflow (validated, 5 nodes, 2 gates)

tests/
└── paintingExplorer.test.ts          # Workflow tests with mocked LLM responses
```

## Adding a New Video Type

1. Create `src/videos/<name>/` with a Remotion composition and types
2. Create a Flow Weaver workflow in `.fwstack/workflows/` or `src/workflows/`
3. Register the composition in `src/Root.tsx`
4. Add render script to `package.json`

## Why Flow Weaver?

A script could call Claude twice and write JSON. Flow Weaver gives you:

- **Gates** — Validation nodes that reject bad LLM output before it reaches rendering. No garbage in, no garbage out.
- **Visibility** — Every node's input/output is inspectable. When the video looks wrong, you trace back to which node produced bad data.
- **Iteration** — Swap Claude for GPT, add a retry node, insert a meme-selection step — without rewriting plumbing.
- **Testing** — Mock LLM responses and test the full pipeline deterministically.
- **Composability** — The image analysis node works in any workflow, not just this one.

The video is the demo. The workflow is the product.

## Tech Stack

- **[Flow Weaver](https://github.com/synergenius-fw/flow-weaver)** — Workflow engine (TypeScript, JSDoc annotations, compile-time validation)
- **[Remotion](https://remotion.dev)** — React-based programmatic video rendering
- **[Claude API](https://docs.anthropic.com)** — Vision analysis + narrative generation
- **[Zod](https://zod.dev)** — Scene manifest schema validation
- **[sharp](https://sharp.pixelplumbing.com)** — Image metadata and resizing

## License

MIT
