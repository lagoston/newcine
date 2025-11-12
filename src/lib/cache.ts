interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresIn: number;
}

class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000;

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresIn: ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const isExpired = now - entry.timestamp > entry.expiresIn;

    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    const now = Date.now();
    const isExpired = now - entry.timestamp > entry.expiresIn;

    if (isExpired) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: string): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach(key => {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export const cache = new CacheManager();

export const CACHE_KEYS = {
  MOVIE_DETAILS: (movieId: number) => `movie:${movieId}`,
  USER_LIBRARY: (userId: string) => `library:${userId}`,
  USER_PROFILE: (userId: string) => `profile:${userId}`,
  USER_STATS: (userId: string) => `stats:${userId}`,
  COMMUNITY_USERS: 'community:users',
  TMDB_GENRES: 'tmdb:genres',
  USER_FOLLOWING: (userId: string) => `following:${userId}`,
  USER_FOLLOWERS: (userId: string) => `followers:${userId}`,
};

export const CACHE_TTL = {
  MOVIE_DETAILS: 30 * 60 * 1000,
  USER_LIBRARY: 2 * 60 * 1000,
  USER_PROFILE: 5 * 60 * 1000,
  USER_STATS: 5 * 60 * 1000,
  COMMUNITY_USERS: 1 * 60 * 1000,
  TMDB_GENRES: 24 * 60 * 60 * 1000,
  SHORT: 30 * 1000,
};
