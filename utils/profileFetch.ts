import { cacheBio, type UserBioData } from './bioCache';
import { log } from './debug';

const fetchedHandles = new Set<string>();
const pendingFetches = new Map<string, Promise<UserBioData | null>>();

export function hasAttemptedFetch(handle: string): boolean {
  return fetchedHandles.has(handle.toLowerCase().replace('@', ''));
}

export async function fetchUserProfile(handle: string): Promise<UserBioData | null> {
  const normalizedHandle = handle.toLowerCase().replace('@', '');

  if (fetchedHandles.has(normalizedHandle)) {
    log(` Already attempted fetch for @${normalizedHandle}, skipping`);
    return null;
  }

  const pending = pendingFetches.get(normalizedHandle);
  if (pending) {
    log(` Waiting for pending fetch for @${normalizedHandle}`);
    return pending;
  }

  const fetchPromise = doFetchProfile(normalizedHandle);
  pendingFetches.set(normalizedHandle, fetchPromise);

  try {
    const result = await fetchPromise;
    return result;
  } finally {
    pendingFetches.delete(normalizedHandle);
    fetchedHandles.add(normalizedHandle);
  }
}

async function doFetchProfile(handle: string): Promise<UserBioData | null> {
  log(` Fetching profile for @${handle} via MAIN world`);

  return new Promise((resolve) => {
    const requestId = `${handle}-${Date.now()}`;
    const timeout = setTimeout(() => {
      window.removeEventListener('shillsniffer-profile-result', handler);
      log(` Profile fetch timed out for @${handle}`);
      resolve(null);
    }, 10000);

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        requestId: string;
        success: boolean;
        data?: {
          handle: string;
          name: string;
          bio: string;
          verifiedType?: string;
          followersCount?: number;
          profileUrl?: string;
        };
        error?: string;
      }>;

      if (customEvent.detail.requestId !== requestId) return;

      clearTimeout(timeout);
      window.removeEventListener('shillsniffer-profile-result', handler);

      if (customEvent.detail.success && customEvent.detail.data) {
        const data = customEvent.detail.data;
        const userData: UserBioData = {
          handle: data.handle,
          name: data.name,
          bio: data.bio,
          verifiedType: data.verifiedType as 'blue' | 'gold' | 'gray' | undefined,
          followersCount: data.followersCount,
          profileUrl: data.profileUrl,
          cachedAt: Date.now(),
        };

        cacheBio(userData.handle, userData.name, userData.bio, {
          verifiedType: userData.verifiedType,
          followersCount: userData.followersCount,
          profileUrl: userData.profileUrl,
        });

        resolve(userData);
      } else {
        log(` MAIN world fetch failed for @${handle}: ${customEvent.detail.error}`);
        resolve(null);
      }
    };

    window.addEventListener('shillsniffer-profile-result', handler);

    window.dispatchEvent(new CustomEvent('shillsniffer-fetch-profile', {
      detail: { handle, requestId }
    }));
  });
}

export function resetFetchTracking(): void {
  fetchedHandles.clear();
  pendingFetches.clear();
}
