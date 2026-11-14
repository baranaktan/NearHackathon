import { migrate, STORAGE_KEY, type PersistedState } from './schema';

/** Minimal Storage surface, so tests can pass an in-memory implementation. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // storage disabled (privacy mode, sandboxed iframe)
  }
}

export function serialize(state: PersistedState): string {
  return JSON.stringify(state);
}

/** Parse a stored string; anything unreadable gives a fresh state. */
export function parseStored(text: string | null): PersistedState {
  if (text === null) return migrate(null);
  try {
    return migrate(JSON.parse(text));
  } catch {
    return migrate(null);
  }
}

export function loadState(storage: KeyValueStorage | null = defaultStorage()): PersistedState {
  try {
    return parseStored(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return migrate(null);
  }
}

/** Returns false when the browser refused the write (quota, disabled storage). */
export function saveState(state: PersistedState, storage: KeyValueStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState(storage: KeyValueStorage | null = defaultStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
