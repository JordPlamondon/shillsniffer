import { defineContentScript } from 'wxt/sandbox';
import { findUnprocessedTweets, parseTweet, markAsProcessed, isTwitterPage, findSelfRepliesForTweet, isSelfReply } from '../utils/parser';
import { analyzeWithScore, replyHasPromotionalSignals, hasPromotionalContent, type ScoredHeuristicResult, type SelfReplyAnalysis } from '../utils/heuristics';
import { log, error } from '../utils/debug';
import {
  injectStyles,
  injectBadge,
  setBadgeLoading,
  setBadgeResult,
  setBadgeError,
  setBadgeLocalVerdict,
  setBadgeCachedResult,
  hasLocalVerdict,
} from '../utils/badge';
import { cacheBio, getBio, getUserData, getBioCacheStats } from '../utils/bioCache';
import { fetchUserProfile, hasAttemptedFetch } from '../utils/profileFetch';
import type { TweetData } from '../utils/types';
import type { AnalyzeRequest, AnalyzeResponse } from '../utils/api';
import { LRUCache } from '../utils/lruCache';

const TWEET_CACHE_LIMIT = 200;
const SCORE_CACHE_LIMIT = 200;

const tweetCache = new LRUCache<string, TweetData>(TWEET_CACHE_LIMIT);
const scoreCache = new LRUCache<string, ScoredHeuristicResult>(SCORE_CACHE_LIMIT);

export default defineContentScript({
  matches: ['*://twitter.com/*', '*://x.com/*'],
  runAt: 'document_idle',

  main() {
    if (!isTwitterPage()) {
      return;
    }

    log(' Content script loaded on Twitter/X');

    setupBioListener();
    injectStyles();

    // Delay to allow API responses with bio data to arrive first
    setTimeout(() => {
      log(' Starting initial tweet processing');
      processNewTweets();
      setupTweetObserver();
    }, 500);
  },
});

interface UserEventData {
  handle: string;
  name: string;
  bio: string;
  verifiedType?: 'blue' | 'gold' | 'gray' | 'none';
  followersCount?: number;
  professionalCategory?: string;
  profileUrl?: string;
  affiliateLabel?: string;
}

const tweetsNeedingBioUpdate = new Map<string, string[]>();
const prefetchingHandles = new Set<string>();

const PREFETCH_RATE_LIMIT = 5;
const PREFETCH_RATE_WINDOW_MS = 10000;
const prefetchTimestamps: number[] = [];

function setupBioListener(): void {
  window.addEventListener('shillsniffer-users', ((event: CustomEvent<{ users: UserEventData[] }>) => {
    const { users } = event.detail;

    for (const user of users) {
      const hadBioBefore = getBio(user.handle);

      cacheBio(user.handle, user.name, user.bio, {
        verifiedType: user.verifiedType,
        followersCount: user.followersCount,
        professionalCategory: user.professionalCategory,
        profileUrl: user.profileUrl,
        affiliateLabel: user.affiliateLabel,
      });

      if (!hadBioBefore && user.bio) {
        const normalizedHandle = user.handle.toLowerCase().replace('@', '');
        const tweetIds = tweetsNeedingBioUpdate.get(normalizedHandle);
        if (tweetIds && tweetIds.length > 0) {
          log(` Bio arrived for @${normalizedHandle} - re-scoring ${tweetIds.length} tweet(s)`);
          for (const tweetId of tweetIds) {
            rescoreTweetWithBio(tweetId, user.bio);
          }
          tweetsNeedingBioUpdate.delete(normalizedHandle);
        }
      }
    }

    const stats = getBioCacheStats();
    if (stats.count % 10 === 0) {
      log(` Bio cache now has ${stats.count} users`);
    }
  }) as EventListener);

  window.addEventListener('shillsniffer-profile-result', ((event: CustomEvent<{
    requestId: string;
    success: boolean;
    data?: { handle: string; bio: string };
  }>) => {
    const { success, data } = event.detail;
    if (success && data?.bio) {
      const normalizedHandle = data.handle.toLowerCase().replace('@', '');
      prefetchingHandles.delete(normalizedHandle);

      const tweetIds = tweetsNeedingBioUpdate.get(normalizedHandle);
      if (tweetIds && tweetIds.length > 0) {
        log(` Prefetch complete for @${normalizedHandle} - re-scoring ${tweetIds.length} tweet(s)`);
        for (const tweetId of tweetIds) {
          rescoreTweetWithBio(tweetId, data.bio);
        }
        tweetsNeedingBioUpdate.delete(normalizedHandle);
      }
    }
  }) as EventListener);

  log(' Bio listener set up');
}

function rescoreTweetWithBio(tweetId: string, bio: string): void {
  const tweet = tweetCache.get(tweetId);
  if (!tweet) return;

  const oldScore = scoreCache.get(tweetId);

  const newScore = analyzeWithScore(
    tweet.text,
    tweet.author.name,
    tweet.author.handle,
    bio,
    tweet.tweetType
  );

  scoreCache.set(tweetId, newScore);

  const badge = tweet.element.querySelector(`[data-tweet-id="${tweetId}"]`) as HTMLElement;
  if (!badge) return;

  const scoreImproved = newScore.score > (oldScore?.score || 0);
  const nowCanShowLocal = newScore.canShowLocalVerdict && !oldScore?.canShowLocalVerdict;

  if (scoreImproved) {
    log(` Score improved for @${tweet.author.handle}: ${oldScore?.score || 0} → ${newScore.score}`);
  }

  if (newScore.canShowLocalVerdict && newScore.suggestedConfidence) {
    const isAiAnalyzed = badge.className.includes('--low') ||
                          badge.className.includes('--medium') ||
                          badge.className.includes('--high');
    const isLocalOnly = hasLocalVerdict(badge);

    if (!isAiAnalyzed || isLocalOnly) {
      setBadgeLocalVerdict(badge, newScore.suggestedConfidence, newScore.verdictReasons);
      log(` Updated badge for @${tweet.author.handle} to ${newScore.suggestedConfidence}`);
    }
  }
}

function trackTweetNeedingBio(tweetId: string, handle: string): void {
  const normalizedHandle = handle.toLowerCase().replace('@', '');
  const existing = tweetsNeedingBioUpdate.get(normalizedHandle) || [];
  if (!existing.includes(tweetId)) {
    existing.push(tweetId);
    tweetsNeedingBioUpdate.set(normalizedHandle, existing);
  }
}

function canPrefetch(): boolean {
  const now = Date.now();
  while (prefetchTimestamps.length > 0 && prefetchTimestamps[0] < now - PREFETCH_RATE_WINDOW_MS) {
    prefetchTimestamps.shift();
  }
  return prefetchTimestamps.length < PREFETCH_RATE_LIMIT;
}

function recordPrefetch(): void {
  prefetchTimestamps.push(Date.now());
}

function prefetchBioForUser(handle: string): void {
  const normalizedHandle = handle.toLowerCase().replace('@', '');

  if (getBio(handle)) return;
  if (prefetchingHandles.has(normalizedHandle)) return;
  if (hasAttemptedFetch(handle)) return;

  if (!canPrefetch()) {
    log(` Prefetch rate limited, skipping @${handle}`);
    return;
  }

  prefetchingHandles.add(normalizedHandle);
  recordPrefetch();
  log(` Prefetching bio for @${handle}`);

  const requestId = `prefetch-${handle}-${Date.now()}`;
  window.dispatchEvent(new CustomEvent('shillsniffer-fetch-profile', {
    detail: { handle: normalizedHandle, requestId }
  }));
}

function processNewTweets(): void {
  const tweets = findUnprocessedTweets();

  if (tweets.length === 0) {
    return;
  }

  log(` Found ${tweets.length} new tweets to process`);

  for (const tweetElement of tweets) {
    const tweetData = parseTweet(tweetElement);

    if (tweetData) {
      handleTweet(tweetData);
    }

    markAsProcessed(tweetElement);
  }
}

function handleTweet(tweet: TweetData): void {
  if (tweet.tweetType === 'retweet') {
    return;
  }

  const cachedBio = getBio(tweet.author.handle);
  const authorBio = tweet.author.bio || cachedBio;

  if (tweet.tweetType === 'reply') {
    const hasPromoSignals = replyHasPromotionalSignals(tweet.text, authorBio || '', tweet.author.handle);
    if (!hasPromoSignals) {
      return;
    }
    log(` Reply from @${tweet.author.handle} has promotional signals, analyzing`);
  }

  if (!authorBio) {
    log(` No bio found for @${tweet.author.handle} - will analyze without bio context`);
    trackTweetNeedingBio(tweet.id, tweet.author.handle);
  }

  let scoredResult = analyzeWithScore(
    tweet.text,
    tweet.author.name,
    tweet.author.handle,
    authorBio,
    tweet.tweetType
  );

  // Check for promotional self-replies even if parent tweet has no indicators
  if (!scoredResult.hasIndicators && (tweet.tweetType === 'original' || tweet.tweetType === 'quote')) {
    const selfReplyCheck = checkForPromotionalSelfRepliesEarly(tweet, authorBio);
    if (selfReplyCheck) {
      scoredResult = {
        ...scoredResult,
        hasIndicators: true,
        matches: ['promotional self-reply'],
        category: 'action',
        score: selfReplyCheck.score,
        scoreBreakdown: {
          ...scoredResult.scoreBreakdown,
          selfReplyPromo: selfReplyCheck.score,
        },
        canShowLocalVerdict: selfReplyCheck.score >= 50,
        suggestedConfidence: selfReplyCheck.score >= 80 ? 'high' : selfReplyCheck.score >= 50 ? 'medium' : null,
        verdictReasons: selfReplyCheck.reasons,
        selfReplyAnalysis: selfReplyCheck.analysis,
      };
      log(` Flagging tweet due to promotional self-reply. Score: ${scoredResult.score}`);
    }
  }

  if (!scoredResult.hasIndicators) {
    return;
  }

  log('Flagged:', {
    author: `@${tweet.author.handle}`,
    name: tweet.author.name,
    tweetType: tweet.tweetType,
    score: scoredResult.score,
    canShowLocal: scoredResult.canShowLocalVerdict,
    confidence: scoredResult.suggestedConfidence,
    breakdown: scoredResult.scoreBreakdown,
  });

  tweetCache.set(tweet.id, tweet);
  scoreCache.set(tweet.id, scoredResult);

  injectBadge(tweet.element, scoredResult, tweet.id, (badge) => {
    handleBadgeClick(badge, tweet.id);
  });

  if (scoredResult.canShowLocalVerdict && scoredResult.suggestedConfidence) {
    const badge = tweet.element.querySelector(`[data-tweet-id="${tweet.id}"]`) as HTMLElement;
    if (badge) {
      setBadgeLocalVerdict(badge, scoredResult.suggestedConfidence, scoredResult.verdictReasons);
    }
  }

  if (!authorBio) {
    prefetchBioForUser(tweet.author.handle);
  }

  if (tweet.tweetType === 'original' || tweet.tweetType === 'quote') {
    checkForPromotionalSelfReplies(tweet, authorBio);
  }
}

function checkForPromotionalSelfRepliesEarly(
  parentTweet: TweetData,
  authorBio?: string
): { score: number; reasons: string[]; analysis: SelfReplyAnalysis } | null {
  const selfReplies = findSelfRepliesForTweet(parentTweet);

  if (selfReplies.length === 0) {
    return null;
  }

  const analysis: SelfReplyAnalysis = {
    hasPromotionalSelfReply: false,
    promotionalContent: [],
    promotionalReplyIds: [],
    allSignals: [],
  };

  for (const reply of selfReplies) {
    const promoCheck = hasPromotionalContent(reply.text, authorBio, parentTweet.author.handle);

    if (promoCheck.isPromotional) {
      analysis.hasPromotionalSelfReply = true;
      analysis.promotionalContent.push(promoCheck);
      analysis.promotionalReplyIds.push(reply.id);
      analysis.allSignals.push(...promoCheck.signals);
    }
  }

  if (!analysis.hasPromotionalSelfReply) {
    return null;
  }

  const hasStrongSignal = analysis.promotionalContent.some(p => p.strength === 'strong');
  const hasModerateSignal = analysis.promotionalContent.some(p => p.strength === 'moderate');
  const score = hasStrongSignal ? 60 : hasModerateSignal ? 45 : 30;

  const signalSummary = analysis.allSignals.slice(0, 2).join(', ');
  const reasons = [`Promotional self-reply detected: ${signalSummary}`];

  return { score, reasons, analysis };
}

function checkForPromotionalSelfReplies(parentTweet: TweetData, authorBio?: string): void {
  const selfReplies = findSelfRepliesForTweet(parentTweet);

  if (selfReplies.length === 0) {
    return;
  }

  const analysis: SelfReplyAnalysis = {
    hasPromotionalSelfReply: false,
    promotionalContent: [],
    promotionalReplyIds: [],
    allSignals: [],
  };

  for (const reply of selfReplies) {
    const promoCheck = hasPromotionalContent(reply.text, authorBio, parentTweet.author.handle);

    if (promoCheck.isPromotional) {
      analysis.hasPromotionalSelfReply = true;
      analysis.promotionalContent.push(promoCheck);
      analysis.promotionalReplyIds.push(reply.id);
      analysis.allSignals.push(...promoCheck.signals);

      log(` Promotional self-reply detected for @${parentTweet.author.handle}:`, {
        parentTweetId: parentTweet.id,
        replyId: reply.id,
        signals: promoCheck.signals,
        strength: promoCheck.strength,
      });
    }
  }

  if (!analysis.hasPromotionalSelfReply) {
    return;
  }

  const existingScore = scoreCache.get(parentTweet.id);
  if (existingScore) {
    const selfReplyBonus = analysis.promotionalContent.some(p => p.strength === 'strong') ? 50 : 40;
    existingScore.scoreBreakdown.selfReplyPromo = selfReplyBonus;
    existingScore.selfReplyAnalysis = analysis;

    const newScore = Object.values(existingScore.scoreBreakdown).reduce((a, b) => a + b, 0);
    existingScore.score = Math.max(0, newScore);

    const signalSummary = analysis.allSignals.slice(0, 2).join(', ');
    existingScore.verdictReasons.push(`Promotional self-reply: ${signalSummary}`);

    if (existingScore.score >= 80) {
      existingScore.canShowLocalVerdict = true;
      existingScore.suggestedConfidence = 'high';
    } else if (existingScore.score >= 50) {
      existingScore.canShowLocalVerdict = true;
      existingScore.suggestedConfidence = 'medium';
    }

    const badge = parentTweet.element.querySelector(`[data-tweet-id="${parentTweet.id}"]`) as HTMLElement;
    if (badge && existingScore.canShowLocalVerdict && existingScore.suggestedConfidence) {
      setBadgeLocalVerdict(badge, existingScore.suggestedConfidence, existingScore.verdictReasons);
      log(` Updated parent tweet badge due to promotional self-reply. New score: ${existingScore.score}`);
    }
  }
}

async function handleBadgeClick(badge: HTMLElement, tweetId: string): Promise<void> {
  const tweet = tweetCache.get(tweetId);
  if (!tweet) {
    error(' Tweet not found in cache:', tweetId);
    setBadgeError(badge, 'Tweet data not found');
    return;
  }

  const isAlreadyAnalyzed = badge.className.includes('--low') ||
    badge.className.includes('--medium') ||
    badge.className.includes('--high');
  const isLocalOnly = hasLocalVerdict(badge);

  if (isAlreadyAnalyzed && !isLocalOnly) {
    log(' Already analyzed with AI, skipping');
    return;
  }

  setBadgeLoading(badge);

  const scoredResult = scoreCache.get(tweetId);

  let cachedUserData = getUserData(tweet.author.handle);
  let authorBio = tweet.author.bio || cachedUserData?.bio;

  if (!authorBio && !hasAttemptedFetch(tweet.author.handle)) {
    log(` Fetching profile for @${tweet.author.handle}`);
    const fetchedData = await fetchUserProfile(tweet.author.handle);
    if (fetchedData?.bio) {
      authorBio = fetchedData.bio;
      cachedUserData = getUserData(tweet.author.handle);
    }
  }

  const request: AnalyzeRequest = {
    type: 'ANALYZE_TWEET',
    tweetId: tweet.id,
    tweetText: tweet.text,
    authorName: tweet.author.name,
    authorHandle: tweet.author.handle,
    authorBio: authorBio,
    authorMetadata: cachedUserData ? {
      verifiedType: cachedUserData.verifiedType,
      followersCount: cachedUserData.followersCount,
      professionalCategory: cachedUserData.professionalCategory,
      profileUrl: cachedUserData.profileUrl,
      affiliateLabel: cachedUserData.affiliateLabel,
    } : undefined,
    flaggedIndicators: scoredResult?.matches,
  };

  try {
    const response = await chrome.runtime.sendMessage(request) as AnalyzeResponse;

    if (response.success && response.result) {
      badge.removeAttribute('data-local-verdict');

      if (response.cached) {
        setBadgeCachedResult(badge, response.result);
      } else {
        setBadgeResult(badge, response.result);
      }
    } else {
      setBadgeError(badge, response.error || 'Unknown error');
    }
  } catch (err) {
    error(' Failed to analyze tweet:', err);
    setBadgeError(badge, err instanceof Error ? err.message : 'Failed to connect to background script');
  }
}

function setupTweetObserver(): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver((mutations) => {
    const hasNewNodes = mutations.some(
      (mutation) => mutation.addedNodes.length > 0
    );

    if (!hasNewNodes) {
      return;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      processNewTweets();
    }, 100);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  log(' Tweet observer started');
}
