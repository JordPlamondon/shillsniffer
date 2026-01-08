import type { AnalysisResult, LLMProvider } from './types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60000;
const apiCallTimestamps: number[] = [];

export interface RateLimitResult {
  allowed: boolean;
  waitSeconds?: number;
}

export function checkRateLimit(): RateLimitResult {
  const now = Date.now();

  while (apiCallTimestamps.length > 0 && apiCallTimestamps[0] < now - RATE_WINDOW_MS) {
    apiCallTimestamps.shift();
  }

  if (apiCallTimestamps.length >= RATE_LIMIT) {
    const oldestCall = apiCallTimestamps[0];
    const waitMs = (oldestCall + RATE_WINDOW_MS) - now;
    return { allowed: false, waitSeconds: Math.ceil(waitMs / 1000) };
  }

  apiCallTimestamps.push(now);
  return { allowed: true };
}

export interface AuthorMetadata {
  verifiedType?: 'blue' | 'gold' | 'gray' | 'none';
  followersCount?: number;
  professionalCategory?: string;
  profileUrl?: string;
  affiliateLabel?: string;
}

export function buildAnalysisPrompt(
  tweetText: string,
  authorName: string,
  authorHandle: string,
  authorBio?: string,
  flaggedIndicators?: string[],
  metadata?: AuthorMetadata
): string {
  const indicators = flaggedIndicators?.length
    ? `DETECTED INDICATORS: ${flaggedIndicators.join(', ')}`
    : '';

  let bioSection: string;
  if (authorBio) {
    bioSection = `BIO: ${authorBio}`;
  } else {
    bioSection = 'BIO: Empty/not set';
  }

  const metadataLines: string[] = [];
  if (metadata?.verifiedType && metadata.verifiedType !== 'none') {
    const verifiedLabels = { blue: 'Blue verified (subscriber)', gold: 'Gold verified (business/org)', gray: 'Gray verified (government)' };
    metadataLines.push(`Verification: ${verifiedLabels[metadata.verifiedType]}`);
  }
  if (metadata?.followersCount) {
    const formatted = metadata.followersCount >= 1000000
      ? `${(metadata.followersCount / 1000000).toFixed(1)}M`
      : metadata.followersCount >= 1000
        ? `${(metadata.followersCount / 1000).toFixed(0)}K`
        : metadata.followersCount.toString();
    metadataLines.push(`Followers: ${formatted}`);
  }
  if (metadata?.affiliateLabel) {
    metadataLines.push(`Affiliate/Employer label: ${metadata.affiliateLabel}`);
  }
  if (metadata?.professionalCategory) {
    metadataLines.push(`Professional category: ${metadata.professionalCategory}`);
  }
  if (metadata?.profileUrl) {
    metadataLines.push(`Profile URL: ${metadata.profileUrl}`);
  }

  const metadataSection = metadataLines.length > 0 ? metadataLines.join('\n') : '';

  return `You detect undisclosed commercial interest in tweets.

AUTHOR: ${authorName} (@${authorHandle})
${bioSection}
${metadataSection ? `\n${metadataSection}` : ''}
${indicators}

TWEET: "${tweetText}"

TASK: Does this tweet promote the author's commercial interests?

IMPORTANT CONTEXT:
- Empty bio + high followers (100K+) + promoting specific product = likely a major account hiding affiliation
- Gold verified (business) accounts are official company accounts
- Profile URL often reveals company affiliation even if bio is empty
- Affiliate/employer labels are Twitter-verified employment relationships

STRICT RULES:
1. BE CONFIDENT about bio facts: if bio says "building @X" or "founder @X", state it directly - don't hedge with "may be affiliated"
2. Never invent affiliations not in the bio - but DO trust what the bio explicitly states
3. Personal opinions about an industry ≠ promotional (unless pushing their specific product)
4. Recommending competitors is usually NOT self-serving
5. ASKING QUESTIONS about a product is NOT promotional - "what have you built with X?" or "how do you use X?" are genuine questions, not endorsements
6. Only flag as promotional if they're RECOMMENDING, PRAISING, or SELLING - not merely mentioning or asking about

DISCLOSURE LEVELS:
- "disclosed in tweet": Tweet explicitly says "my company", "we built", "our product", etc.
- "disclosed in bio only": Bio shows ownership but tweet doesn't mention it - reader must check bio to know
- "undisclosed": No clear connection visible in bio or tweet

CONFIDENCE GUIDE:
- HIGH: Bio/profile EXPLICITLY shows they own/work for the promoted product (e.g., bio says "founder @product" and tweet promotes @product)
- MEDIUM: Promotional patterns detected but NO confirmed affiliation in bio - could be genuine enthusiasm OR undisclosed paid promotion
- LOW: Discussing their industry without pushing specific product, OR fully disclosed promotion

CRITICAL - DO NOT HALLUCINATE:
- NEVER claim someone is "affiliated" or "connected" unless their bio EXPLICITLY states it
- If bio doesn't mention the promoted product, say "No visible affiliation in bio" - don't invent connections
- It's OK to say "could be undisclosed promotion" but don't state false facts about their profile

EXAMPLES:

Tweet: "Going live! Come see me implement features in @CoraComputer"
Bio: "building @coracomputer"
✓ GOOD: confidence=medium, explanation="Promoting their own product @CoraComputer (per bio: 'building @coracomputer'), disclosure is in bio only - tweet doesn't explicitly state ownership", businessConnection="builds @coracomputer"

Tweet: "AI agents will change everything"
Bio: "Founder @aiagentco"
✓ GOOD: confidence=medium, explanation="Founder of AI agent company tweeting about AI agents - promotes their space without mentioning their product", businessConnection="founder @aiagentco"

Tweet: "Just shipped a big update to @myapp!"
Bio: "CEO @myapp"
✓ GOOD: confidence=low, explanation="Promoting own product but relationship is clear from context ('shipped' implies ownership)", businessConnection="CEO @myapp", isDisclosed=true

Tweet: "This tool changed my workflow"
Bio: "Created that-tool"
✓ GOOD: confidence=high, explanation="Promoting own product without any disclosure in tweet", businessConnection="creator of that-tool", isDisclosed=false

Tweet: "What are some cool things you've built with Claude Code?"
Bio: "Building @unrelatedstartup, Cursor ambassador"
✓ GOOD: confidence=low, explanation="Asking a genuine question about a tool - not promotional, not affiliated with Claude/Anthropic", businessConnection="builds @unrelatedstartup", hasCommercialInterest=false

Tweet: "This new AI tool changes everything! Here's my full breakdown thread:"
Bio: "Tech enthusiast & developer"
✓ GOOD: confidence=medium, explanation="Enthusiastically promoting a specific product with no visible affiliation in bio - could be genuine enthusiasm or undisclosed paid promotion", businessConnection="none visible in bio", hasCommercialInterest=true

Respond with ONLY this JSON:
{
  "confidence": "low" | "medium" | "high",
  "hasCommercialInterest": true/false,
  "isDisclosed": true/false,
  "explanation": "Factual sentence including the bio connection if relevant",
  "businessConnection": "Direct statement from bio (e.g., 'builds @company', 'founder @startup')"
}`;
}

function sanitizeOutput(text: string): string {
  if (!text) return '';

  let sanitized = text
    .replace(/@\s*undefined/gi, '')
    .replace(/undefined/gi, 'unknown')
    .replace(/\s+/g, ' ')
    .trim();

  if (sanitized.length < 3) {
    return '';
  }

  return sanitized;
}

export function parseAnalysisResponse(content: string): AnalysisResult {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const explanation = sanitizeOutput(parsed.explanation) || 'Analysis complete';
    const businessConnection = sanitizeOutput(parsed.businessConnection) || 'Unable to determine from available info';

    return {
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'medium',
      hasCommercialInterest: Boolean(parsed.hasCommercialInterest),
      isDisclosed: Boolean(parsed.isDisclosed),
      explanation,
      businessConnection,
    };
  } catch (e) {
    console.error('[ShillSniffer] Failed to parse AI response:', e);
    return {
      confidence: 'medium',
      hasCommercialInterest: true,
      isDisclosed: false,
      explanation: 'Could not parse AI response',
      businessConnection: 'Unknown',
    };
  }
}

export interface AnalyzeRequest {
  type: 'ANALYZE_TWEET';
  tweetId: string;
  tweetText: string;
  authorName: string;
  authorHandle: string;
  authorBio?: string;
  authorMetadata?: AuthorMetadata;
  flaggedIndicators?: string[];
}

export interface AnalyzeResponse {
  type: 'ANALYZE_RESULT';
  tweetId: string;
  success: boolean;
  result?: AnalysisResult;
  error?: string;
  cached?: boolean;
}

export async function callGroqAPI(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

export async function callOllamaAPI(baseUrl: string, model: string, prompt: string): Promise<string> {
  const url = `${baseUrl}/v1/chat/completions`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 0 || errorText.includes('Failed to fetch')) {
        throw new Error('Cannot connect to Ollama. Is it running? Start with: ollama serve');
      }
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (e) {
    if (e instanceof TypeError && e.message.includes('Failed to fetch')) {
      throw new Error('Cannot connect to Ollama. Is it running? Start with: ollama serve');
    }
    throw e;
  }
}

export async function callLLM(
  provider: LLMProvider,
  prompt: string,
  config: {
    apiKey?: string;
    ollamaUrl?: string;
    ollamaModel?: string;
  }
): Promise<string> {
  if (provider === 'ollama') {
    if (!config.ollamaUrl || !config.ollamaModel) {
      throw new Error('Ollama URL and model are required');
    }
    return callOllamaAPI(config.ollamaUrl, config.ollamaModel, prompt);
  } else {
    if (!config.apiKey) {
      throw new Error('Groq API key is required');
    }
    return callGroqAPI(config.apiKey, prompt);
  }
}
