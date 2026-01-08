import type { TweetData, AuthorData, TweetType } from './types';

const SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  userName: '[data-testid="User-Name"]',
  tweetText: '[data-testid="tweetText"]',
  userBio: '[data-testid="UserDescription"]',
  socialContext: '[data-testid="socialContext"]',
  quoteTweet: '[data-testid="quoteTweet"]',
} as const;

const PROCESSED_ATTR = 'data-shillsniffer-processed';

export function extractAuthor(tweetElement: HTMLElement): AuthorData | null {
  const userNameElement = tweetElement.querySelector(SELECTORS.userName);
  if (!userNameElement) {
    return null;
  }

  const links = userNameElement.querySelectorAll('a[href^="/"]');
  let handle = '';
  let name = '';

  for (const link of links) {
    const href = link.getAttribute('href');
    if (href && href.startsWith('/') && !href.includes('/status/')) {
      handle = href.slice(1);

      const nameSpan = userNameElement.querySelector('span span');
      if (nameSpan) {
        name = nameSpan.textContent?.trim() || '';
      }
      break;
    }
  }

  if (!handle) {
    return null;
  }

  return {
    name: name || handle,
    handle,
    bio: undefined,
  };
}

export function extractTweetText(tweetElement: HTMLElement): string {
  const textElement = tweetElement.querySelector(SELECTORS.tweetText);
  return textElement?.textContent?.trim() || '';
}

export function extractTweetId(tweetElement: HTMLElement): string {
  const statusLink = tweetElement.querySelector('a[href*="/status/"]');
  if (statusLink) {
    const href = statusLink.getAttribute('href') || '';
    const match = href.match(/\/status\/(\d+)/);
    if (match) {
      return match[1];
    }
  }

  const text = extractTweetText(tweetElement);
  const author = extractAuthor(tweetElement);
  const combined = `${author?.handle || ''}-${text.slice(0, 50)}`;
  return hashString(combined);
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function detectTweetType(tweetElement: HTMLElement): { type: TweetType; replyingTo?: string } {
  const socialContext = tweetElement.querySelector(SELECTORS.socialContext);
  if (socialContext) {
    const text = socialContext.textContent?.toLowerCase() || '';
    if (text.includes('reposted') || text.includes('retweeted')) {
      return { type: 'retweet' };
    }
  }

  const quoteTweet = tweetElement.querySelector(SELECTORS.quoteTweet);
  if (quoteTweet) {
    return { type: 'quote' };
  }

  const allText = tweetElement.textContent || '';
  const replyingToMatch = allText.match(/Replying to\s+(@\w+(?:\s+@\w+)*)/i);
  if (replyingToMatch) {
    const handles = replyingToMatch[1].match(/@(\w+)/g);
    return {
      type: 'reply',
      replyingTo: handles ? handles[0].slice(1) : undefined
    };
  }

  const tweetTextEl = tweetElement.querySelector('[data-testid="tweetText"]');
  if (tweetTextEl) {
    let container = tweetTextEl.parentElement;
    while (container && container !== tweetElement) {
      const prevSibling = container.previousElementSibling;
      if (prevSibling) {
        const siblingText = prevSibling.textContent || '';
        if (siblingText.toLowerCase().includes('replying to')) {
          const handleMatch = siblingText.match(/@(\w+)/);
          return {
            type: 'reply',
            replyingTo: handleMatch ? handleMatch[1] : undefined
          };
        }
      }
      container = container.parentElement;
    }
  }

  return { type: 'original' };
}

export function parseTweet(tweetElement: HTMLElement): TweetData | null {
  const author = extractAuthor(tweetElement);
  if (!author) {
    return null;
  }

  const text = extractTweetText(tweetElement);
  const id = extractTweetId(tweetElement);
  const { type: tweetType, replyingTo } = detectTweetType(tweetElement);

  return {
    id,
    text,
    author,
    element: tweetElement,
    tweetType,
    replyingTo,
  };
}

export function findUnprocessedTweets(): HTMLElement[] {
  const allTweets = document.querySelectorAll<HTMLElement>(SELECTORS.tweet);
  const unprocessed: HTMLElement[] = [];

  for (const tweet of allTweets) {
    if (!tweet.hasAttribute(PROCESSED_ATTR)) {
      unprocessed.push(tweet);
    }
  }

  return unprocessed;
}

export function markAsProcessed(tweetElement: HTMLElement): void {
  tweetElement.setAttribute(PROCESSED_ATTR, 'true');
}

export function isTwitterPage(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'twitter.com' || hostname === 'x.com' || hostname.endsWith('.twitter.com') || hostname.endsWith('.x.com');
}

export function isSelfReply(tweet: TweetData): boolean {
  if (tweet.tweetType !== 'reply' || !tweet.replyingTo) {
    return false;
  }
  return tweet.author.handle.toLowerCase() === tweet.replyingTo.toLowerCase();
}

export function findSelfRepliesInDOM(authorHandle: string): TweetData[] {
  const allTweets = document.querySelectorAll<HTMLElement>(SELECTORS.tweet);
  const selfReplies: TweetData[] = [];
  const normalizedHandle = authorHandle.toLowerCase();

  for (const tweetEl of allTweets) {
    const parsed = parseTweet(tweetEl);
    if (!parsed) continue;

    if (
      parsed.author.handle.toLowerCase() === normalizedHandle &&
      parsed.tweetType === 'reply' &&
      parsed.replyingTo?.toLowerCase() === normalizedHandle
    ) {
      selfReplies.push(parsed);
    }
  }

  return selfReplies;
}

export function findTweetsByAuthor(authorHandle: string): TweetData[] {
  const allTweets = document.querySelectorAll<HTMLElement>(SELECTORS.tweet);
  const authorTweets: TweetData[] = [];
  const normalizedHandle = authorHandle.toLowerCase();

  for (const tweetEl of allTweets) {
    const parsed = parseTweet(tweetEl);
    if (!parsed) continue;

    if (parsed.author.handle.toLowerCase() === normalizedHandle) {
      authorTweets.push(parsed);
    }
  }

  return authorTweets;
}

export function findSelfRepliesForTweet(parentTweet: TweetData): TweetData[] {
  const allTweets = document.querySelectorAll<HTMLElement>(SELECTORS.tweet);
  const selfReplies: TweetData[] = [];
  const authorHandle = parentTweet.author.handle.toLowerCase();

  let foundParent = false;

  for (const tweetEl of allTweets) {
    const parsed = parseTweet(tweetEl);
    if (!parsed) continue;

    if (parsed.id === parentTweet.id) {
      foundParent = true;
      continue;
    }

    if (foundParent) {
      const isReplyFromSameAuthor =
        parsed.author.handle.toLowerCase() === authorHandle &&
        parsed.tweetType === 'reply';

      if (isReplyFromSameAuthor) {
        selfReplies.push(parsed);
      } else if (parsed.author.handle.toLowerCase() !== authorHandle) {
        break;
      }
    }
  }

  return selfReplies;
}
