# ShillSniffer

A browser extension that detects undisclosed commercial interest in Twitter/X posts.

## The Problem

Tech Twitter is full of posts that look like genuine insights but are actually undisclosed promotions. Founders post "AI is changing everything" while their bio says they run an AI startup. You waste mental energy evaluating every post for ulterior motives.

## How It Works

**Passive Detection (always on, no API needed)**
- Scans author bios for commercial indicators (founder, CEO, investor, etc.)
- Detects self-promotional patterns in tweets
- Catches promo codes, affiliate links, and promotional self-replies
- Shows a badge on flagged tweets

**AI Analysis (on click)**
- Click any badge for deeper analysis
- Uses Groq (cloud) or Ollama (local) for LLM inference
- Returns confidence level + explanation

## Install

### From Source
```bash
git clone https://github.com/JordPlamondon/shillsniffer.git
cd shill-sniffer
npm install
npm run build
```

Then load `.output/chrome-mv3` as an unpacked extension in Chrome.

### From Chrome Web Store
Coming soon.

## Setup

1. Click the extension icon
2. Choose your LLM provider:
   - **Groq** (cloud): Get a free API key at [console.groq.com](https://console.groq.com)
   - **Ollama** (local): Run `ollama serve` locally for 100% free, unlimited analysis

## What Gets Flagged

- Role indicators: founder, CEO, investor, advisor, etc.
- Action phrases: "building", "launched", "check out my..."
- Promo codes: "use code JOHN20 for 20% off"
- Affiliate links: Amazon tags, referral parameters
- Promotional self-replies: harmless tweet + promo in the replies

## Badge Colors

- **Gray**: Commercial interest detected, click to analyze
- **Yellow**: Medium confidence promotional content
- **Red**: High confidence promotional content
- **Green**: Low risk (disclosed or not promotional)

## Privacy

- No data leaves your browser except LLM API calls (when you click to analyze)
- API keys are stored locally in Chrome extension storage
- No tracking, no analytics

## Tech Stack

- [WXT](https://wxt.dev) - Extension framework
- TypeScript
- Groq API / Ollama for LLM inference

## License

MIT
