import { LRUCache } from "./lruCache";
import { log } from "./debug";

export interface UserBioData {
    handle: string;
    name: string;
    bio: string;
    verifiedType?: "blue" | "gold" | "gray" | "none";
    followersCount?: number;
    professionalCategory?: string;
    profileUrl?: string;
    affiliateLabel?: string;
    cachedAt: number;
}

const BIO_CACHE_LIMIT = 500;
const CACHE_TTL_MS = 30 * 60 * 1000;

const bioCache = new LRUCache<string, UserBioData>(BIO_CACHE_LIMIT);

export function cacheBio(
    handle: string,
    name: string,
    bio: string,
    metadata?: {
        verifiedType?: "blue" | "gold" | "gray" | "none";
        followersCount?: number;
        professionalCategory?: string;
        profileUrl?: string;
        affiliateLabel?: string;
    },
): void {
    const normalizedHandle = handle.toLowerCase().replace("@", "");

    bioCache.set(normalizedHandle, {
        handle: normalizedHandle,
        name,
        bio,
        verifiedType: metadata?.verifiedType,
        followersCount: metadata?.followersCount,
        professionalCategory: metadata?.professionalCategory,
        profileUrl: metadata?.profileUrl,
        affiliateLabel: metadata?.affiliateLabel,
        cachedAt: Date.now(),
    });

    const extras: string[] = [];
    if (metadata?.verifiedType && metadata.verifiedType !== "none") extras.push(metadata.verifiedType);
    if (metadata?.followersCount) extras.push(`${(metadata.followersCount / 1000).toFixed(0)}K followers`);
    if (metadata?.affiliateLabel) extras.push(metadata.affiliateLabel);

    const extrasStr = extras.length > 0 ? ` [${extras.join(", ")}]` : "";
    log(` Cached bio for @${normalizedHandle}${extrasStr}: "${bio.slice(0, 50)}${bio.length > 50 ? "..." : ""}"`);
}

export function getBio(handle: string): string | undefined {
    const normalizedHandle = handle.toLowerCase().replace("@", "");
    const cached = bioCache.get(normalizedHandle);

    if (!cached) {
        return undefined;
    }

    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
        bioCache.delete(normalizedHandle);
        return undefined;
    }

    return cached.bio || undefined;
}

export function getUserData(handle: string): UserBioData | undefined {
    const normalizedHandle = handle.toLowerCase().replace("@", "");
    const cached = bioCache.get(normalizedHandle);

    if (!cached) {
        return undefined;
    }

    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
        bioCache.delete(normalizedHandle);
        return undefined;
    }

    return cached;
}

export function getBioCacheStats(): { count: number; handles: string[] } {
    return {
        count: bioCache.size,
        handles: Array.from(bioCache.keys()),
    };
}

export function clearBioCache(): void {
    bioCache.clear();
}

export function extractUsersFromTwitterResponse(data: unknown): void {
    if (!data || typeof data !== "object") return;

    try {
        findAndCacheUsers(data);
    } catch (e) {
        console.error("[ShillSniffer] Error extracting users from response:", e);
    }
}

function findAndCacheUsers(obj: unknown, depth = 0): void {
    if (depth > 15 || !obj || typeof obj !== "object") return;

    if (isUserObject(obj)) {
        const user = obj as Record<string, unknown>;

        let handle = user.screen_name as string | undefined;
        let name = user.name as string | undefined;
        let bio = user.description as string | undefined;

        const legacy = user.legacy as Record<string, unknown> | undefined;
        if (legacy) {
            handle = handle || (legacy.screen_name as string);
            name = name || (legacy.name as string);
            bio = bio || (legacy.description as string);
        }

        if (handle && bio !== undefined) {
            cacheBio(handle, name || handle, bio);
        }
    }

    if (Array.isArray(obj)) {
        for (const item of obj) {
            findAndCacheUsers(item, depth + 1);
        }
    } else {
        for (const value of Object.values(obj)) {
            findAndCacheUsers(value, depth + 1);
        }
    }
}

function isUserObject(obj: unknown): boolean {
    if (!obj || typeof obj !== "object") return false;

    const o = obj as Record<string, unknown>;

    if (o.__typename === "User" || o.__typename === "UserResults") {
        return true;
    }

    if (typeof o.screen_name === "string" && o.screen_name.length > 0) {
        return true;
    }

    const legacy = o.legacy as Record<string, unknown> | undefined;
    if (legacy && typeof legacy.screen_name === "string") {
        return true;
    }

    const result = o.result as Record<string, unknown> | undefined;
    if (result) {
        const resultLegacy = result.legacy as Record<string, unknown> | undefined;
        if (resultLegacy && typeof resultLegacy.screen_name === "string") {
            return true;
        }
    }

    return false;
}
