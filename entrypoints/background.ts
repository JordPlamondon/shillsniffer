import { defineBackground } from 'wxt/sandbox';
import { storage } from 'wxt/storage';
import type { Settings } from '../utils/types';
import { DEFAULT_SETTINGS } from '../utils/types';
import { log, error } from '../utils/debug';
import {
  buildAnalysisPrompt,
  parseAnalysisResponse,
  callLLM,
  checkRateLimit,
  type AnalyzeRequest,
  type AnalyzeResponse,
} from '../utils/api';
import {
  getCachedResult,
  cacheResult,
  cachedToResult,
  pruneExpired,
} from '../utils/cache';

const settingsStorage = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

export default defineBackground(() => {
  log(' Background service worker started');

  pruneExpired().catch(console.error);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'ANALYZE_TWEET') {
      handleAnalyzeRequest(message as AnalyzeRequest)
        .then(sendResponse)
        .catch((err) => {
          sendResponse({
            type: 'ANALYZE_RESULT',
            tweetId: message.tweetId,
            success: false,
            error: err.message,
          } as AnalyzeResponse);
        });

      return true;
    }
  });
});

async function handleAnalyzeRequest(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  const settings = await settingsStorage.getValue();

  if (settings.llmProvider === 'groq' && !settings.apiKey) {
    return {
      type: 'ANALYZE_RESULT',
      tweetId: request.tweetId,
      success: false,
      error: 'No API key configured. Click the extension icon to add your Groq API key.',
    };
  }

  if (settings.llmProvider === 'ollama' && !settings.ollamaUrl) {
    return {
      type: 'ANALYZE_RESULT',
      tweetId: request.tweetId,
      success: false,
      error: 'Ollama URL not configured. Click the extension icon to configure.',
    };
  }

  if (!settings.enableAiAnalysis) {
    return {
      type: 'ANALYZE_RESULT',
      tweetId: request.tweetId,
      success: false,
      error: 'AI analysis is disabled in settings.',
    };
  }

  const cached = await getCachedResult(request.authorHandle, request.tweetText);
  if (cached) {
    log(' Cache hit for:', request.authorHandle);
    return {
      type: 'ANALYZE_RESULT',
      tweetId: request.tweetId,
      success: true,
      result: cachedToResult(cached),
      cached: true,
    };
  }

  if (settings.llmProvider === 'groq') {
    const rateLimitResult = checkRateLimit();
    if (!rateLimitResult.allowed) {
      return {
        type: 'ANALYZE_RESULT',
        tweetId: request.tweetId,
        success: false,
        error: `Slow down! Rate limited. Try again in ${rateLimitResult.waitSeconds} seconds.`,
      };
    }
  }

  try {
    const prompt = buildAnalysisPrompt(
      request.tweetText,
      request.authorName,
      request.authorHandle,
      request.authorBio,
      request.flaggedIndicators,
      request.authorMetadata
    );

    const responseText = await callLLM(settings.llmProvider, prompt, {
      apiKey: settings.apiKey,
      ollamaUrl: settings.ollamaUrl,
      ollamaModel: settings.ollamaModel,
    });
    const result = parseAnalysisResponse(responseText);

    await cacheResult(request.authorHandle, request.tweetText, result);

    log(' Analysis complete:', {
      tweetId: request.tweetId,
      provider: settings.llmProvider,
      confidence: result.confidence,
      explanation: result.explanation,
    });

    return {
      type: 'ANALYZE_RESULT',
      tweetId: request.tweetId,
      success: true,
      result,
    };
  } catch (err) {
    console.error('[ShillSniffer] Analysis failed:', err);
    return {
      type: 'ANALYZE_RESULT',
      tweetId: request.tweetId,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
