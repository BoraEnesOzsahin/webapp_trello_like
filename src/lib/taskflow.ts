export type UserRecord = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  createdAt: string;
};

export type CardRecord = {
  id: string;
  title: string;
  description: string;
  creatorId: string;      // Who created this card
  creatorName?: string;   // Creator's username (for display)
  assigneeId?: string;    // Who this is assigned to
  assigneeName?: string;  // Assignee's username (for display)
  createdAt: string;
  updatedAt: string;
};

export type ColumnRecord = {
  id: string;
  title: string;
  cards: CardRecord[];
};

export type BoardRecord = {
  id: string;
  title: string;
  description: string;
  columns: ColumnRecord[];
  createdAt: string;
  updatedAt: string;
};

export type ActivityEntry = {
  id: string;
  message: string;
  timestamp: string;
};

export type WorkspaceState = {
  boards: BoardRecord[];
  activeBoardId: string | null;
  activity: ActivityEntry[];
};

const USER_STORAGE_KEY = 'taskflow:users';
const SESSION_STORAGE_KEY = 'taskflow:session';
const WORKSPACE_STORAGE_PREFIX = 'taskflow:workspace:';

export function usersStorageKey() {
  return USER_STORAGE_KEY;
}

export function sessionStorageKey() {
  return SESSION_STORAGE_KEY;
}

export function workspaceStorageKey(userId: string) {
  return `${WORKSPACE_STORAGE_PREFIX}${userId}`;
}

export function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password);

  return crypto.subtle.digest('SHA-256', bytes).then((digest) =>
    Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
  );
}

export function readStorage<T>(key: string, fallback: T) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function createBoard(title: string): BoardRecord {
  const now = nowIso();

  return {
    id: createId('board'),
    title,
    description: 'A fresh board for a new team flow.',
    createdAt: now,
    updatedAt: now,
    columns: [
      {
        id: createId('column'),
        title: 'Backlog',
        cards: [],
      },
      {
        id: createId('column'),
        title: 'In Progress',
        cards: [],
      },
      {
        id: createId('column'),
        title: 'Done',
        cards: [],
      },
    ],
  };
}

export function createColumn(title: string) {
  return {
    id: createId('column'),
    title,
    cards: [] as CardRecord[],
  };
}

export function createCard(title: string, description: string, creatorId: string, creatorName?: string) {
  const now = nowIso();

  return {
    id: createId('card'),
    title,
    description,
    creatorId,
    creatorName,
    createdAt: now,
    updatedAt: now,
  } satisfies CardRecord;
}

export function createActivity(message: string): ActivityEntry {
  return {
    id: createId('activity'),
    message,
    timestamp: nowIso(),
  };
}

export function defaultWorkspace(ownerName: string): WorkspaceState {
  const now = nowIso();

  return {
    activeBoardId: null,
    activity: [
      {
        id: createId('activity'),
        message: `TaskFlow workspace ready for ${ownerName}`,
        timestamp: now,
      },
    ],
    boards: [createBoard('Launch Sprint')],
  };
}
