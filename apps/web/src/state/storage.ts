import { migrate, STATE_VERSION, STORAGE_KEY, type PersistedState } from './schema';

/**
 * Where a stored state this build cannot read (corrupt JSON, or another
 * schema version) is copied before the app starts over, so the next save
 * cannot destroy a wallet key or recovery phrase it still contains.
 */
export const BACKUP_KEY = 'perde:state:unreadable-backup';

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

function readable(text: string): boolean {
  try {
    const raw: unknown = JSON.parse(text);
    return typeof raw === 'object' && raw !== null && (raw as { v?: unknown }).v === STATE_VERSION;
  } catch {
    return false;
  }
}

export function loadState(storage: KeyValueStorage | null = defaultStorage()): PersistedState {
  try {
    const text = storage?.getItem(STORAGE_KEY) ?? null;
    if (text !== null && !readable(text) && storage && storage.getItem(BACKUP_KEY) === null) storage.setItem(BACKUP_KEY, text);
    return parseStored(text);
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
    storage?.removeItem(BACKUP_KEY);
  } catch {
    /* nothing to clear */
  }
}
