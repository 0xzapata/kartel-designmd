# designmd

Extract design systems from any website and generate `DESIGN.md` files using AI vision.

A Chrome extension that captures full-page screenshots, extracts design tokens (colors, typography, spacing, components), and generates Google Stitch-compatible `DESIGN.md` documentation using AI.

## Features

- **Full-page screenshot capture** — scrolls and stitches multi-viewport captures
- **AI-powered token extraction** — combines CSS analysis with visual screenshot analysis
- **Shadow DOM support** — traverses web components and shadow roots
- **CSS-in-JS detection** — detects Tailwind, styled-components, Emotion, and other frameworks
- **Multi-provider support** — Gemini, OpenAI, Claude, Ollama (local)
- **History persistence** — stores up to 20 extractions in IndexedDB
- **Preview before generation** — review extracted tokens before sending to AI
- **Editable output** — modify generated markdown before copy/download
- **Progress tracking** — percentage indicator and cancel button
- **Dark mode toggle** — extension UI has light/dark themes
- **Settings sync** — export/import configuration as JSON

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the project folder

## Usage

1. Visit any website
2. Click the **designmd** icon in your toolbar
3. Configure AI provider and model in Settings (gear icon)
4. Click **Extract & Generate**
5. Review the preview, optionally edit tokens
6. Wait for AI to generate `DESIGN.md`
7. Copy or download the output

### Getting API Keys

| Provider | Free Tier | Setup |
|----------|-----------|-------|
| **Gemini** | 15 req/min | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| **OpenAI** | Paid | [API Keys](https://platform.openai.com/api-keys) |
| **Claude** | Paid | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| **Ollama** | Free (local) | [Ollama.com](https://ollama.com/download) + `ollama pull llama3` |

## Architecture

```
designmd/
├── manifest.json      # Manifest V3 Chrome Extension
├── popup.html/css/js # Main UI (settings, history, preview, output)
├── background.js     # Service worker (AI calls, history)
├── content.js        # Content script (Shadow DOM, CSS-in-JS detection)
└── lib/
    ├── adapter.js    # Multi-provider AI adapter
    ├── db.js         # IndexedDB wrapper for history
    ├── extractor.js  # DOM/CSS extraction logic
    └── screenshot.js # Screenshot capture and stitching
```

## Generated DESIGN.md Sections

1. Overview (platform, aesthetic, visual style)
2. Colors (semantic roles)
3. Typography (font scale, weights, casing)
4. Spacing & Layout
5. Photography & Visual Style
6. Elevation & Shadows
7. Border & Shape
8. Components
9. Content Structure Pattern
10. Brand Voice
11. Brand Assets & Key Concepts
12. Animations & Transitions
13. Do's and Don'ts

## Comparison with Original Designpull

| Feature | Designpull | designmd |
|---------|------------|----------|
| Content script | No (injected on-demand) | Yes (persistent) |
| Shadow DOM | No | Yes |
| CSS-in-JS | No | Yes (Tailwind, styled, Emotion) |
| History | No | Yes (IndexedDB, 20 items) |
| Preview | No | Yes (tokens + thumbnail) |
| Cancel button | No | Yes |
| Progress % | No | Yes |
| Editable output | No | Yes |
| Dark mode | No | Yes |
| Retry logic | No | Yes (3x exponential backoff) |
| Request caching | No | Yes (1hr TTL) |
| Screenshot format | JPEG only | JPEG + PNG |

## License

MIT
