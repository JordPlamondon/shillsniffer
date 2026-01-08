import { defineContentScript } from 'wxt/sandbox';

export default defineContentScript({
  matches: ['*://twitter.com/*', '*://x.com/*'],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    const originalFetch = window.fetch;
    let discoveredQueryId: string | null = null;

    window.addEventListener('shillsniffer-fetch-profile', async (event: Event) => {
      const customEvent = event as CustomEvent<{ handle: string; requestId: string }>;
      const { handle, requestId } = customEvent.detail;

      try {
        const csrfToken = document.cookie
          .split('; ')
          .find(row => row.startsWith('ct0='))
          ?.split('=')[1];

        if (!csrfToken) {
          throw new Error('No CSRF token found');
        }

        const queryIds = [
          discoveredQueryId,
          'BQ6xjFU6Mgm-WhEP3OiT9w',
          'xmU6X_CKVnQ5lSrCbXFOPQ',
          'sLVLhk0bGj3MVFEKTdax1w',
          'G3KGOASz96M-Qu0nwmGXNg',
          'NimuplG1OB7Fd2btCLdBOw',
          'qRednkZG-rn1P6b48NINmQ',
        ].filter(Boolean) as string[];

        const variables = JSON.stringify({
          screen_name: handle,
          withSafetyModeUserFields: true
        });

        const features = JSON.stringify({
          hidden_profile_subscriptions_enabled: true,
          rweb_tipjar_consumption_enabled: true,
          responsive_web_graphql_exclude_directive_enabled: true,
          verified_phone_label_enabled: false,
          subscriptions_verification_info_is_identity_verified_enabled: true,
          subscriptions_verification_info_verified_since_enabled: true,
          highlights_tweets_tab_ui_enabled: true,
          responsive_web_twitter_article_notes_tab_enabled: true,
          subscriptions_feature_can_gift_premium: true,
          creator_subscriptions_tweet_preview_api_enabled: true,
          responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
          responsive_web_graphql_timeline_navigation_enabled: true
        });

        let userData: Record<string, unknown> | null = null;
        let lastError = '';

        for (const queryId of queryIds) {
          try {
            const apiUrl = `${window.location.origin}/i/api/graphql/${queryId}/UserByScreenName?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(features)}`;

            const response = await originalFetch(apiUrl, {
              method: 'GET',
              headers: {
                'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                'x-csrf-token': csrfToken,
                'x-twitter-auth-type': 'OAuth2Session',
                'x-twitter-active-user': 'yes',
                'x-twitter-client-language': 'en',
              },
              credentials: 'include',
            });

            if (response.status === 200) {
              const data = await response.json();
              const result = data?.data?.user?.result;
              if (result && result.__typename !== 'UserUnavailable' && result.legacy) {
                userData = result;
                discoveredQueryId = queryId;
                break;
              }
            }
            lastError = `QueryId ${queryId}: status ${response.status}`;
          } catch (e) {
            lastError = `QueryId ${queryId}: ${e}`;
          }
        }

        if (!userData) {
          throw new Error(`All queryIds failed. Last error: ${lastError}`);
        }

        const legacy = userData.legacy as Record<string, unknown>;

        let profileUrlValue: string | undefined;
        const entities = legacy.entities as Record<string, unknown> | undefined;
        if (entities?.url) {
          const urlEntity = entities.url as Record<string, unknown>;
          const urls = urlEntity.urls as Array<{ expanded_url?: string }> | undefined;
          if (urls?.[0]?.expanded_url) {
            profileUrlValue = urls[0].expanded_url;
          }
        }

        let verifiedType: string | undefined;
        if (userData.is_blue_verified) verifiedType = 'blue';
        else if (legacy.verified_type === 'Business') verifiedType = 'gold';
        else if (legacy.verified_type === 'Government') verifiedType = 'gray';

        const result = {
          handle: (legacy.screen_name as string) || handle,
          name: (legacy.name as string) || handle,
          bio: (legacy.description as string) || '',
          verifiedType,
          followersCount: legacy.followers_count as number | undefined,
          profileUrl: profileUrlValue,
        };

        window.dispatchEvent(new CustomEvent('shillsniffer-profile-result', {
          detail: { requestId, success: true, data: result }
        }));

      } catch (err) {
        console.error(`[ShillSniffer] Failed to fetch @${handle}:`, err);
        window.dispatchEvent(new CustomEvent('shillsniffer-profile-result', {
          detail: { requestId, success: false, error: String(err) }
        }));
      }
    });

    const captureQueryId = (url: string) => {
      const match = url.match(/\/graphql\/([^/]+)\/UserByScreenName/);
      if (match && match[1]) {
        discoveredQueryId = match[1];
      }
    };

    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      const url = args[0] instanceof Request ? args[0].url : String(args[0]);

      captureQueryId(url);

      if (isTwitterApiUrl(url)) {
        try {
          const cloned = response.clone();
          const data = await cloned.json();
          processTwitterResponse(data, url);
        } catch {
          // Ignore JSON parse errors
        }
      }

      return response;
    };

    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
      (this as XMLHttpRequest & { _url: string })._url = url.toString();
      // @ts-expect-error - rest params typing
      return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', function () {
        const url = (this as XMLHttpRequest & { _url: string })._url;
        if (isTwitterApiUrl(url)) {
          try {
            const data = JSON.parse(this.responseText);
            processTwitterResponse(data, url);
          } catch {
            // Ignore parse errors
          }
        }
      });
      return originalXHRSend.apply(this, args);
    };
  },
});

function isTwitterApiUrl(url: string): boolean {
  return (
    url.includes('/graphql/') ||
    url.includes('/i/api/') ||
    url.includes('api.twitter.com') ||
    url.includes('api.x.com')
  );
}

function processTwitterResponse(data: unknown, url: string): void {
  if (!data || typeof data !== 'object') return;

  const users: UserData[] = [];
  findUsers(data, users, 0);

  const usersWithBios = users.filter(u => u.bio && u.bio.trim().length > 0);

  if (usersWithBios.length > 0) {
    window.dispatchEvent(
      new CustomEvent('shillsniffer-users', {
        detail: { users: usersWithBios },
      })
    );
  }
}

interface UserData {
  handle: string;
  name: string;
  bio: string;
  verifiedType?: 'blue' | 'gold' | 'gray' | 'none';
  followersCount?: number;
  professionalCategory?: string;
  profileUrl?: string;
  affiliateLabel?: string;
}

function getVerifiedType(obj: Record<string, unknown>): 'blue' | 'gold' | 'gray' | 'none' {
  if (obj.is_blue_verified || obj.verified_type === 'Blue') return 'blue';
  if (obj.verified_type === 'Business') return 'gold';
  if (obj.verified_type === 'Government') return 'gray';
  if (obj.verified === true) return 'blue';
  return 'none';
}

function getProfileUrl(obj: Record<string, unknown>): string | undefined {
  const entities = obj.entities as Record<string, unknown> | undefined;
  if (!entities) return undefined;

  const url = entities.url as Record<string, unknown> | undefined;
  if (!url) return undefined;

  const urls = url.urls as Array<{ expanded_url?: string }> | undefined;
  if (urls && urls.length > 0 && urls[0].expanded_url) {
    return urls[0].expanded_url;
  }
  return undefined;
}

function getAffiliateLabel(obj: Record<string, unknown>): string | undefined {
  const affiliates = obj.affiliates_highlighted_label as Record<string, unknown> | undefined;
  if (affiliates?.label) {
    const label = affiliates.label as Record<string, unknown>;
    if (label.badge?.description) return label.badge.description as string;
    if (label.description) return label.description as string;
  }

  const professional = obj.professional as Record<string, unknown> | undefined;
  if (professional?.category) {
    const categories = professional.category as Array<{ name?: string }> | undefined;
    if (categories && categories.length > 0 && categories[0].name) {
      return categories[0].name;
    }
  }

  return undefined;
}

function findUsers(obj: unknown, users: UserData[], depth: number): void {
  if (depth > 20 || !obj || typeof obj !== 'object') return;

  const o = obj as Record<string, unknown>;

  if (o.legacy && typeof o.legacy === 'object') {
    const legacy = o.legacy as Record<string, unknown>;
    if (typeof legacy.screen_name === 'string') {
      const handle = legacy.screen_name;
      const name = (legacy.name as string) || handle;
      const bio = (legacy.description as string) || '';

      const verifiedType = getVerifiedType(legacy) !== 'none' ? getVerifiedType(legacy) : getVerifiedType(o);
      const followersCount = (legacy.followers_count as number) || (o.followers_count as number);
      const profileUrl = getProfileUrl(legacy) || getProfileUrl(o);
      const affiliateLabel = getAffiliateLabel(o) || getAffiliateLabel(legacy);

      const professional = o.professional as Record<string, unknown> | undefined;
      const professionalCategory = professional?.category?.[0]?.name as string | undefined;

      if (!users.some((u) => u.handle.toLowerCase() === handle.toLowerCase())) {
        users.push({
          handle,
          name,
          bio,
          verifiedType: verifiedType !== 'none' ? verifiedType : undefined,
          followersCount,
          professionalCategory,
          profileUrl,
          affiliateLabel,
        });
      }
      return;
    }
  }

  if (typeof o.screen_name === 'string' && o.screen_name.length > 0) {
    const handle = o.screen_name;
    const name = (o.name as string) || handle;
    const bio = (o.description as string) || '';

    const verifiedType = getVerifiedType(o);
    const followersCount = o.followers_count as number | undefined;
    const profileUrl = getProfileUrl(o);
    const affiliateLabel = getAffiliateLabel(o);

    if (!users.some((u) => u.handle.toLowerCase() === handle.toLowerCase())) {
      users.push({
        handle,
        name,
        bio,
        verifiedType: verifiedType !== 'none' ? verifiedType : undefined,
        followersCount,
        profileUrl,
        affiliateLabel,
      });
    }
    return;
  }

  if (o.result && typeof o.result === 'object') {
    findUsers(o.result, users, depth + 1);
  }

  if (o.user_results && typeof o.user_results === 'object') {
    findUsers(o.user_results, users, depth + 1);
  }

  if (o.core && typeof o.core === 'object') {
    findUsers(o.core, users, depth + 1);
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      findUsers(item, users, depth + 1);
    }
    return;
  }

  const skipKeys = new Set(['entities', 'extended_entities', 'media', 'urls', 'hashtags', 'symbols', 'user_mentions']);
  for (const [key, value] of Object.entries(o)) {
    if (!skipKeys.has(key) && value && typeof value === 'object') {
      findUsers(value, users, depth + 1);
    }
  }
}
