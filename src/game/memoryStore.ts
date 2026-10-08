import { KeyValueStore } from '../types';

/** In-memory KeyValueStore for tests. Behaves like VS Code's globalState. */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, unknown>();

  get<T>(key: string, defaultValue: T): T {
    return this.data.has(key) ? (this.data.get(key) as T) : defaultValue;
  }

  update(key: string, value: unknown): Promise<void> {
    // Like globalState, storing undefined removes the key.
    if (value === undefined) {
      this.data.delete(key);
    } else {
      // Store a copy so callers can't mutate saved state by accident.
      this.data.set(key, structuredClone(value));
    }
    return Promise.resolve();
  }

  keys(): string[] {
    return [...this.data.keys()];
  }
}
