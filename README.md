# TaskFlow

TaskFlow is a lightweight Kanban board built with Next.js, TypeScript, and dnd-kit.

## What it does

- Local account signup and sign-in
- Board creation with editable titles and descriptions
- Column creation and column title editing
- Card creation, editing, and drag-and-drop between columns
- Board, column, and card ordering that persists in localStorage
- Responsive layout for desktop and mobile browsers

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Notes

- Authentication is browser-local for the MVP and is not backed by an external identity provider.
- Ordering and workspace data are stored per user in localStorage so they survive refreshes on the same browser.