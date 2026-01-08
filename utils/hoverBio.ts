import { log } from './debug';

const attemptedHandles = new Set<string>();

const hoverQueue: Array<{
  element: HTMLElement;
  handle: string;
  resolve: (bio: string | null) => void;
}> = [];

let isProcessingQueue = false;

export async function extractBioViaHover(
  tweetElement: HTMLElement,
  handle: string
): Promise<string | null> {
  const normalizedHandle = handle.toLowerCase().replace('@', '');

  if (attemptedHandles.has(normalizedHandle)) {
    return null;
  }
  attemptedHandles.add(normalizedHandle);

  const hoverTarget = findHoverTarget(tweetElement);
  if (!hoverTarget) {
    log(` Could not find hover target for @${handle}`);
    return null;
  }

  return new Promise((resolve) => {
    hoverQueue.push({ element: hoverTarget, handle: normalizedHandle, resolve });
    processQueue();
  });
}

function findHoverTarget(tweetElement: HTMLElement): HTMLElement | null {
  const avatar = tweetElement.querySelector('[data-testid="Tweet-User-Avatar"]') as HTMLElement;
  if (avatar) return avatar;

  const authorLink = tweetElement.querySelector('[data-testid="User-Name"] a[href^="/"]') as HTMLElement;
  if (authorLink) return authorLink;

  return null;
}

async function processQueue(): Promise<void> {
  if (isProcessingQueue || hoverQueue.length === 0) return;

  isProcessingQueue = true;

  while (hoverQueue.length > 0) {
    const item = hoverQueue.shift()!;

    try {
      const bio = await performHoverExtraction(item.element, item.handle);
      item.resolve(bio);
    } catch (error) {
      console.error(`[ShillSniffer] Hover extraction failed for @${item.handle}:`, error);
      item.resolve(null);
    }

    await sleep(100);
  }

  isProcessingQueue = false;
}

async function performHoverExtraction(
  target: HTMLElement,
  handle: string
): Promise<string | null> {
  target.dispatchEvent(new MouseEvent('mouseenter', {
    bubbles: true,
    cancelable: true,
    view: window,
  }));

  target.dispatchEvent(new MouseEvent('mouseover', {
    bubbles: true,
    cancelable: true,
    view: window,
  }));

  const hoverCard = await waitForHoverCard(600);

  if (!hoverCard) {
    dismissHover(target);
    log(` Hover card did not appear for @${handle}`);
    return null;
  }

  const bio = extractBioFromHoverCard(hoverCard);
  dismissHover(target);

  if (bio) {
    log(` Extracted bio via hover for @${handle}: "${bio.slice(0, 50)}..."`);
  }

  return bio;
}

async function waitForHoverCard(timeoutMs: number): Promise<HTMLElement | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const hoverCard = document.querySelector('[data-testid="HoverCard"]') as HTMLElement;
    if (hoverCard) {
      await sleep(50);
      return hoverCard;
    }

    const hoverLayer = document.querySelector('[data-testid="hoverCardParent"]') as HTMLElement;
    if (hoverLayer) {
      await sleep(50);
      return hoverLayer;
    }

    await sleep(30);
  }

  return null;
}

function extractBioFromHoverCard(hoverCard: HTMLElement): string | null {
  const bioElement = hoverCard.querySelector('[data-testid="UserDescription"]') as HTMLElement;
  if (bioElement?.textContent) {
    return bioElement.textContent.trim();
  }

  const spans = hoverCard.querySelectorAll('span');
  for (const span of spans) {
    const text = span.textContent?.trim();
    if (text && text.length > 20 && !text.startsWith('@') && !text.includes(' followers')) {
      return text;
    }
  }

  return null;
}

function dismissHover(target: HTMLElement): void {
  target.dispatchEvent(new MouseEvent('mouseleave', {
    bubbles: true,
    cancelable: true,
    view: window,
  }));

  target.dispatchEvent(new MouseEvent('mouseout', {
    bubbles: true,
    cancelable: true,
    view: window,
  }));

  document.body.dispatchEvent(new MouseEvent('mouseover', {
    bubbles: true,
    cancelable: true,
    view: window,
  }));
}

export function hasAttemptedHover(handle: string): boolean {
  return attemptedHandles.has(handle.toLowerCase().replace('@', ''));
}

export function clearAttemptedHandles(): void {
  attemptedHandles.clear();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
