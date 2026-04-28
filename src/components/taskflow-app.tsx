"use client";

import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityEntry,
  BoardRecord,
  CardRecord,
  ColumnRecord,
  WorkspaceState,
  createActivity,
  createBoard,
  createCard,
  createColumn,
  createId,
  defaultWorkspace,
  hashPassword,
  nowIso,
  readStorage,
  sessionStorageKey,
  usersStorageKey,
  workspaceStorageKey,
  writeStorage,
  type UserRecord,
} from '@/lib/taskflow';

type AuthMode = 'login' | 'signup';

type AuthFormState = {
  username: string;
  email: string;
  password: string;
  teamName?: string;
};

type CardDraft = {
  boardId: string;
  columnId: string;
  cardId: string | null;
  title: string;
  description: string;
  assigneeId?: string;
};

type DragData = {
  type: 'column' | 'card';
  columnId?: string;
  cardId?: string;
};

function formatActivityTime(activity: ActivityEntry) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(activity.timestamp));
}

function findBoard(workspace: WorkspaceState | null, boardId: string | null) {
  return workspace?.boards.find((board) => board.id === boardId) ?? null;
}

function findColumn(board: BoardRecord | null, columnId: string | null) {
  return board?.columns.find((column) => column.id === columnId) ?? null;
}

function findCard(board: BoardRecord | null, cardId: string | null) {
  if (!board || !cardId) {
    return null;
  }

  for (const column of board.columns) {
    const match = column.cards.find((card) => card.id === cardId);
    if (match) {
      return match;
    }
  }

  return null;
}

function findCardLocation(board: BoardRecord | null, cardId: string) {
  if (!board) {
    return null;
  }

  for (const [columnIndex, column] of board.columns.entries()) {
    const cardIndex = column.cards.findIndex((card) => card.id === cardId);
    if (cardIndex >= 0) {
      return { columnIndex, cardIndex };
    }
  }

  return null;
}

export function TaskFlowApp() {
  const useServer = process.env.NEXT_PUBLIC_USE_SUPABASE === '1' || process.env.NEXT_PUBLIC_USE_SUPABASE === 'true';
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState<AuthFormState>({
    username: '',
    email: '',
    password: '',
    teamName: '',
  });
  const [boardTitle, setBoardTitle] = useState('');
  const [columnTitle, setColumnTitle] = useState('');
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null);
  const [draggedData, setDraggedData] = useState<DragData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 12 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const loadedUsers = readStorage<UserRecord[]>(usersStorageKey(), []);
      const loadedSession = readStorage<{ userId: string | null }>(sessionStorageKey(), { userId: null });

      setUsers(loadedUsers);
      setSessionUserId(loadedSession.userId);

      if (loadedSession.userId) {
        const loadedWorkspace = readStorage<WorkspaceState | null>(workspaceStorageKey(loadedSession.userId), null);
        const ownerName = loadedUsers.find((user) => user.id === loadedSession.userId)?.username ?? 'User';
        const fallbackWorkspace =
          loadedWorkspace ?? defaultWorkspace(ownerName, loadedSession.userId, false);

        setWorkspace({
          ...fallbackWorkspace,
          activeBoardId: fallbackWorkspace.activeBoardId ?? fallbackWorkspace.boards[0]?.id ?? null,
        });
        // If server sync is enabled, prefer server workspace when available
        if (useServer) {
          fetch(`/api/workspace?userId=${encodeURIComponent(loadedSession.userId)}`)
            .then(async (r) => {
              if (r.ok) {
                try {
                  const serverWorkspace = await r.json();
                  if (serverWorkspace) {
                    setWorkspace(serverWorkspace as WorkspaceState);
                  }
                } catch {
                  // ignore parse errors
                }
              }
            })
            .catch(() => {
              /* ignore network errors */
            });
        }
      }

      setMounted(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (mounted) {
      writeStorage(usersStorageKey(), users);
    }
  }, [mounted, users]);

  useEffect(() => {
    if (mounted) {
      writeStorage(sessionStorageKey(), { userId: sessionUserId });
    }
  }, [mounted, sessionUserId]);

  useEffect(() => {
    if (mounted && sessionUserId && workspace) {
      writeStorage(workspaceStorageKey(sessionUserId), workspace);
      if (useServer) {
        (async () => {
          try {
            await fetch('/api/workspace', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ userId: sessionUserId, workspace }),
            });
          } catch {
            /* ignore */
          }
        })();
      }
    }
  }, [mounted, sessionUserId, workspace]);

  const currentUser = useMemo(
    () => users.find((user) => user.id === sessionUserId) ?? null,
    [sessionUserId, users],
  );

  const activeBoard = useMemo(() => {
    if (!workspace) {
      return null;
    }

    return findBoard(workspace, workspace.activeBoardId ?? workspace.boards[0]?.id ?? null);
  }, [workspace]);

  const activeCardPreview = useMemo(() => {
    if (!workspace || !activeBoard || !draggedData) {
      return null;
    }

    if (draggedData.type === 'card') {
      return findCard(activeBoard, draggedData.cardId ?? null);
    }

    return findColumn(activeBoard, draggedData.columnId ?? null);
  }, [activeBoard, draggedData, workspace]);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);

    const username = authForm.username.trim();
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password.trim();
    const teamName = authForm.teamName?.trim();

    if (!email || !password || (authMode === 'signup' && (!username || !teamName))) {
      setAuthError('Tüm alanları doldur.');
      return;
    }

    const passwordHash = await hashPassword(password);

    if (authMode === 'signup') {
      if (users.some((user) => user.email === email)) {
        setAuthError('Bu e-posta zaten kayıtlı.');
        return;
      }

      if (users.some((user) => user.username === username)) {
        setAuthError('Bu kullanıcı adı zaten alınmış.');
        return;
      }

      const newUser: UserRecord = {
        id: createId('user'),
        username,
        email,
        passwordHash,
        createdAt: nowIso(),
      };

      const seededWorkspace = defaultWorkspace(newUser.username, newUser.id, true);
      const initialBoardId = seededWorkspace.boards[0]?.id ?? null;

      // Add team info to workspace
      const teamWorkspace = {
        ...seededWorkspace,
        teamName,
        teamId: createId('team'),
        isShared: true,
      };

      setUsers((current) => [...current, newUser]);
      setSessionUserId(newUser.id);
      setWorkspace({
        ...teamWorkspace,
        activeBoardId: initialBoardId,
        activity: [createActivity(`Team "${teamName}" created by ${newUser.username}`), ...teamWorkspace.activity],
      });
      setWorkspace({
        ...seededWorkspace,
        activeBoardId: initialBoardId,
        activity: [createActivity(`Account created for ${newUser.username}`), ...seededWorkspace.activity],
      });

      return;
    }

    const user = users.find((item) => item.email === email && item.passwordHash === passwordHash);

    if (!user) {
      setAuthError('E-posta veya parola hatalı.');
      return;
    }

    const loadedWorkspace = readStorage<WorkspaceState | null>(workspaceStorageKey(user.id), null);
    const fallbackWorkspace = loadedWorkspace ?? defaultWorkspace(user.username, user.id, false);

    setSessionUserId(user.id);
    setWorkspace({
      ...fallbackWorkspace,
      activeBoardId: fallbackWorkspace.activeBoardId ?? fallbackWorkspace.boards[0]?.id ?? null,
    });
  }

  function signOut() {
    setSessionUserId(null);
    setWorkspace(null);
    setCardDraft(null);
    setAuthForm({ username: '', email: '', password: '', teamName: '' });
  }

  function selectBoard(boardId: string) {
    if (!workspace) {
      return;
    }

    const selectedBoard = findBoard(workspace, boardId);

    setWorkspace({
      ...workspace,
      activeBoardId: boardId,
      activity: [createActivity(`Switched to board ${selectedBoard?.title ?? 'board'}`), ...workspace.activity].slice(0, 30),
    });
  }

  function createNewBoard() {
    if (!workspace) {
      return;
    }

    const title = boardTitle.trim() || `Board ${workspace.boards.length + 1}`;
    const nextBoard = createBoard(title);

    setWorkspace({
      ...workspace,
      boards: [...workspace.boards, nextBoard],
      activeBoardId: nextBoard.id,
      activity: [createActivity(`Created board ${title}`), ...workspace.activity].slice(0, 30),
    });

    setBoardTitle('');
  }

  function renameBoard(title: string) {
    if (!workspace || !activeBoard) {
      return;
    }

    setWorkspace({
      ...workspace,
      boards: workspace.boards.map((board) =>
        board.id === activeBoard.id ? { ...board, title, updatedAt: nowIso() } : board,
      ),
    });
  }

  function renameBoardDescription(description: string) {
    if (!workspace || !activeBoard) {
      return;
    }

    setWorkspace({
      ...workspace,
      boards: workspace.boards.map((board) =>
        board.id === activeBoard.id ? { ...board, description, updatedAt: nowIso() } : board,
      ),
    });
  }

  function renameColumn(columnId: string, title: string) {
    if (!workspace || !activeBoard) {
      return;
    }

    setWorkspace({
      ...workspace,
      boards: workspace.boards.map((board) => {
        if (board.id !== activeBoard.id) {
          return board;
        }

        return {
          ...board,
          updatedAt: nowIso(),
          columns: board.columns.map((column) => (column.id === columnId ? { ...column, title } : column)),
        };
      }),
    });
  }

  function createNewColumn() {
    if (!workspace || !activeBoard) {
      return;
    }

    const title = columnTitle.trim() || `Column ${activeBoard.columns.length + 1}`;
    const nextColumn = createColumn(title);

    setWorkspace({
      ...workspace,
      boards: workspace.boards.map((board) =>
        board.id === activeBoard.id
          ? {
              ...board,
              updatedAt: nowIso(),
              columns: [...board.columns, nextColumn],
            }
          : board,
      ),
      activity: [createActivity(`Added column ${title}`), ...workspace.activity].slice(0, 30),
    });

    setColumnTitle('');
  }

  function openNewCard(columnId: string) {
    if (!activeBoard) {
      return;
    }

    setCardDraft({
      boardId: activeBoard.id,
      columnId,
      cardId: null,
      title: '',
      description: '',
      assigneeId: undefined,
    });
  }

  function openEditCard(card: CardRecord, columnId: string) {
    if (!activeBoard) {
      return;
    }

    setCardDraft({
      boardId: activeBoard.id,
      columnId,
      cardId: card.id,
      title: card.title,
      description: card.description,
      assigneeId: card.assigneeId,
    });
  }

  function closeCardEditor() {
    setCardDraft(null);
  }

  function saveCardDraft() {
    if (!workspace || !activeBoard || !cardDraft) {
      return;
    }

    const title = cardDraft.title.trim() || 'Untitled card';
    const description = cardDraft.description.trim();
    const assigneeName = cardDraft.assigneeId ? workspace.members?.find((m) => m.userId === cardDraft.assigneeId)?.username : undefined;

    setWorkspace({
      ...workspace,
      boards: workspace.boards.map((board) => {
        if (board.id !== activeBoard.id) {
          return board;
        }

        return {
          ...board,
          updatedAt: nowIso(),
          columns: board.columns.map((column) => {
            if (column.id !== cardDraft.columnId) {
              return column;
            }

            if (cardDraft.cardId) {
              return {
                ...column,
                cards: column.cards.map((card) =>
                  card.id === cardDraft.cardId ? 
                    { ...card, title, description, assigneeId: cardDraft.assigneeId, assigneeName, updatedAt: nowIso() } 
                    : card,
                ),
              };
            }

            return {
              ...column,
              cards: [...column.cards, 
                {
                  ...createCard(title, description, currentUser!.id, currentUser!.username),
                  assigneeId: cardDraft.assigneeId,
                  assigneeName,
                }
              ],
            };
          }),
        };
      }),
      activity: [
        createActivity(cardDraft.cardId ? `Updated card ${title}` : `Created card ${title}`),
        ...workspace.activity,
      ].slice(0, 30),
    });

    setCardDraft(null);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as DragData | undefined;
    if (data) {
      setDraggedData(data);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggedData(null);

    const { active, over } = event;
    if (!workspace || !activeBoard || !over) {
      return;
    }

    const activeData = active.data.current as DragData | undefined;
    const overData = over.data.current as DragData | undefined;

    if (!activeData || !overData) {
      return;
    }

    if (activeData.type === 'column' && overData.type === 'column') {
      const oldIndex = activeBoard.columns.findIndex((column) => column.id === activeData.columnId);
      const newIndex = activeBoard.columns.findIndex((column) => column.id === overData.columnId);

      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return;
      }

      const nextColumns = arrayMove(activeBoard.columns, oldIndex, newIndex);

      setWorkspace({
        ...workspace,
        boards: workspace.boards.map((board) =>
          board.id === activeBoard.id ? { ...board, columns: nextColumns, updatedAt: nowIso() } : board,
        ),
        activity: [createActivity('Reordered board columns'), ...workspace.activity].slice(0, 30),
      });

      return;
    }

    if (activeData.type !== 'card') {
      return;
    }

    const sourceLocation = findCardLocation(activeBoard, activeData.cardId ?? '');
    const destinationColumnId = overData.type === 'card' ? overData.columnId ?? null : overData.columnId ?? null;

    if (!sourceLocation || !destinationColumnId) {
      return;
    }

    const sourceColumn = activeBoard.columns[sourceLocation.columnIndex];
    const destinationColumnIndex = activeBoard.columns.findIndex((column) => column.id === destinationColumnId);

    if (destinationColumnIndex < 0) {
      return;
    }

    const movingCard = sourceColumn.cards[sourceLocation.cardIndex];
    const nextColumns = activeBoard.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => ({ ...card })),
    }));

    nextColumns[sourceLocation.columnIndex].cards.splice(sourceLocation.cardIndex, 1);

    const destinationCards = nextColumns[destinationColumnIndex].cards;
    const destinationIndex = overData.type === 'card'
      ? destinationCards.findIndex((card) => card.id === overData.cardId)
      : destinationCards.length;

    destinationCards.splice(destinationIndex >= 0 ? destinationIndex : destinationCards.length, 0, movingCard);

    setWorkspace({
      ...workspace,
      boards: workspace.boards.map((board) =>
        board.id === activeBoard.id ? { ...board, columns: nextColumns, updatedAt: nowIso() } : board,
      ),
      activity: [
        createActivity(
          sourceLocation.columnIndex === destinationColumnIndex
            ? `Reordered ${movingCard.title}`
            : `Moved ${movingCard.title} to ${nextColumns[destinationColumnIndex].title}`,
        ),
        ...workspace.activity,
      ].slice(0, 30),
    });
  }

  if (!mounted) {
    return <div className="loading-shell">TaskFlow is loading...</div>;
  }

  if (!currentUser || !workspace) {
    return (
      <main className="auth-shell">
        <section className="hero-panel">
          <div className="eyebrow">TaskFlow</div>
          <h1>Ship a Kanban board that feels fast, calm, and persistent.</h1>
          <p>
            Accounts, boards, columns, cards, and drag and drop are handled in a single workspace that survives refreshes.
          </p>
          <div className="hero-notes">
            <span>dnd-kit</span>
            <span>local persistence</span>
            <span>mobile-friendly touch drag</span>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-tabs">
            <button className={authMode === 'signup' ? 'tab active' : 'tab'} onClick={() => setAuthMode('signup')} type="button">
              Create account
            </button>
            <button className={authMode === 'login' ? 'tab active' : 'tab'} onClick={() => setAuthMode('login')} type="button">
              Sign in
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="auth-form">
            {authMode === 'signup' ? (
              <>
                <label>
                  Username
                  <input
                    value={authForm.username}
                    onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                    placeholder="ada_team"
                  />
                </label>

                <label>
                  Team Name
                  <input
                    value={authForm.teamName}
                    onChange={(event) => setAuthForm((current) => ({ ...current, teamName: event.target.value }))}
                    placeholder="Ada's Team"
                  />
                </label>
              </>
            ) : null}

            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="ada@team.dev"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="••••••••"
              />
            </label>

            {authError ? <p className="form-error">{authError}</p> : null}

            <button className="primary-button" type="submit">
              {authMode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const boardColumns = activeBoard?.columns ?? [];

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div>
            <div className="eyebrow">TaskFlow</div>
            <h2>{workspace?.teamName}</h2>
            <p>{currentUser.username}</p>
            <small style={{ color: 'rgba(169, 183, 218, 0.6)' }}>{currentUser.email}</small>
          </div>
          <button className="ghost-button" onClick={signOut} type="button">
            Sign out
          </button>
        </div>

        <section className="sidebar-section">
          <div className="section-title">Boards</div>
          <div className="board-list">
            {workspace.boards.map((board) => (
              <button
                key={board.id}
                className={workspace.activeBoardId === board.id ? 'board-pill active' : 'board-pill'}
                onClick={() => selectBoard(board.id)}
                type="button"
              >
                <strong>{board.title}</strong>
                <span>{board.columns.length} columns</span>
              </button>
            ))}
          </div>

          <label className="inline-field">
            <span>New board</span>
            <input
              value={boardTitle}
              onChange={(event) => setBoardTitle(event.target.value)}
              placeholder="Release plan"
            />
          </label>

          <button className="secondary-button" onClick={createNewBoard} type="button">
            Add board
          </button>
        </section>

        <section className="sidebar-section">
          <div className="section-title">Team Members</div>
          <div className="members-list">
            {workspace.members?.map((member) => (
              <div key={member.userId} className="member-item">
                <span className="member-name">{member.username}</span>
                <span className="member-role">{member.role}</span>
              </div>
            ))}
          </div>
          {workspace.ownerId === currentUser?.id && (
            <label className="inline-field">
              <span>Invite by email</span>
              <input
                type="email"
                placeholder="teammate@example.com"
                title="Enter email to send workspace invite (demo only - stored locally)"
              />
            </label>
          )}
        </section>

        <section className="sidebar-section activity-section">
          <div className="section-title">Recent activity</div>
          <div className="activity-list">
            {workspace.activity.slice(0, 6).map((item) => (
              <article key={item.id} className="activity-item">
                <strong>{item.message}</strong>
                <span>{formatActivityTime(item)}</span>
              </article>
            ))}
          </div>
        </section>
      </aside>

      <section className="board-shell">
        <header className="board-header">
          <div>
            <div className="eyebrow">Active board</div>
            <input
              className="board-title-input"
              value={activeBoard?.title ?? ''}
              onChange={(event) => renameBoard(event.target.value)}
            />
            <textarea
              className="board-description-input"
              value={activeBoard?.description ?? ''}
              onChange={(event) => renameBoardDescription(event.target.value)}
              rows={2}
            />
          </div>

          <div className="header-actions">
            <label className="inline-field compact">
              <span>Column title</span>
              <input
                value={columnTitle}
                onChange={(event) => setColumnTitle(event.target.value)}
                placeholder="QA"
              />
            </label>
            <button className="primary-button" onClick={createNewColumn} type="button">
              Add column
            </button>
          </div>
        </header>

        <DndContext
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <SortableContext items={boardColumns.map((column) => column.id)} strategy={horizontalListSortingStrategy}>
            <div className="columns-track">
              {boardColumns.map((column) => (
                <BoardColumn
                  key={column.id}
                  column={column}
                  onAddCard={openNewCard}
                  onEditCard={openEditCard}
                  onRenameColumn={renameColumn}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay adjustScale={false}>
            {draggedData?.type === 'card' && activeCardPreview ? (
              <CardPreview card={activeCardPreview as CardRecord} isDragging={true} />
            ) : draggedData?.type === 'column' && activeCardPreview ? (
              <ColumnPreview column={activeCardPreview as ColumnRecord} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </section>

      {cardDraft ? (
        <CardEditorModal
          cardDraft={cardDraft}
          onCancel={closeCardEditor}
          onDescriptionChange={(description) => setCardDraft((current) => (current ? { ...current, description } : current))}
          onSave={saveCardDraft}
          onTitleChange={(title) => setCardDraft((current) => (current ? { ...current, title } : current))}
          onAssigneeChange={(assigneeId) => setCardDraft((current) => (current ? { ...current, assigneeId } : current))}
          teamMembers={workspace?.members}
        />
      ) : null}
    </main>
  );
}

function BoardColumn({
  column,
  onAddCard,
  onEditCard,
  onRenameColumn,
}: {
  column: ColumnRecord;
  onAddCard: (columnId: string) => void;
  onEditCard: (card: CardRecord, columnId: string) => void;
  onRenameColumn: (columnId: string, title: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column', columnId: column.id } satisfies DragData,
  });

  return (
    <section
      ref={setNodeRef}
      className={isDragging ? 'column-panel dragging' : 'column-panel'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
    >
      <header className="column-header">
        <button className="drag-handle" type="button" {...listeners} aria-label={`Drag ${column.title}`}>
          ⠿
        </button>
        <input value={column.title} onChange={(event) => onRenameColumn(column.id, event.target.value)} />
        <span>{column.cards.length}</span>
      </header>

      <SortableContext items={column.cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <div className="card-list">
          {column.cards.map((card) => (
            <SortableCard key={card.id} card={card} columnId={column.id} onEditCard={onEditCard} />
          ))}
        </div>
      </SortableContext>

      <button className="add-card-button" onClick={() => onAddCard(column.id)} type="button">
        + Add card
      </button>
    </section>
  );
}

function SortableCard({
  card,
  columnId,
  onEditCard,
}: {
  card: CardRecord;
  columnId: string;
  onEditCard: (card: CardRecord, columnId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', cardId: card.id, columnId } satisfies DragData,
  });

  return (
    <article
      ref={setNodeRef}
      className={isDragging ? 'card-item dragging' : 'card-item'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
    >
      <button className="drag-handle card-handle" type="button" {...listeners} aria-label={`Drag ${card.title}`}>
        ⋮⋮
      </button>
      <button className="card-body" type="button" onClick={() => onEditCard(card, columnId)}>
        <strong>{card.title}</strong>
        <p>{card.description || 'No description yet.'}</p>
        {card.creatorName && (
          <div className="card-meta">
            <small>by {card.creatorName}</small>
            {card.assigneeName && <small>→ {card.assigneeName}</small>}
          </div>
        )}
      </button>
    </article>
  );
}

function CardPreview({ card, isDragging }: { card: CardRecord; isDragging?: boolean }) {
  return (
    <article className={`card-item ${isDragging ? 'drag-preview' : 'preview'}`} style={isDragging ? { transform: 'none' } : {}}>
      <strong>{card.title}</strong>
      <p>{card.description || 'No description yet.'}</p>
      {card.creatorName && (
        <div className="card-meta">
          <small>by {card.creatorName}</small>
          {card.assigneeName && <small>→ {card.assigneeName}</small>}
        </div>
      )}
    </article>
  );
}

function ColumnPreview({ column }: { column: ColumnRecord }) {
  return (
    <section className="column-panel preview">
      <header className="column-header">
        <span>{column.title}</span>
        <span>{column.cards.length}</span>
      </header>
    </section>
  );
}

function CardEditorModal({
  cardDraft,
  onCancel,
  onDescriptionChange,
  onSave,
  onTitleChange,
  onAssigneeChange,
  teamMembers,
}: {
  cardDraft: CardDraft;
  onCancel: () => void;
  onDescriptionChange: (description: string) => void;
  onSave: () => void;
  onTitleChange: (title: string) => void;
  onAssigneeChange: (assigneeId: string | undefined) => void;
  teamMembers?: Array<{ userId: string; username: string; role: string }>;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">Card details</div>
            <h3>{cardDraft.cardId ? 'Edit card' : 'Create card'}</h3>
          </div>
          <button className="ghost-button" onClick={onCancel} type="button">
            Close
          </button>
        </div>

        <label>
          Title
          <input
            value={cardDraft.title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Story card"
          />
        </label>

        <label>
          Description
          <textarea
            rows={5}
            value={cardDraft.description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Add a crisp implementation note."
          />
        </label>

        <label>
          Assign to
          <select
            value={cardDraft.assigneeId ?? ''}
            onChange={(event) => onAssigneeChange(event.target.value || undefined)}
          >
            <option value="">Unassigned</option>
            {teamMembers?.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.username}
              </option>
            ))}
          </select>
        </label>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="primary-button" onClick={onSave} type="button">
            Save card
          </button>
        </div>
      </div>
    </div>
  );
}