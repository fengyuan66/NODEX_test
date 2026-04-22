# NODEX

NODEX is now a React-based app with a separate frontend and backend:

- `frontend/` - React 19 + TypeScript + Vite client
- `backend/` - Express + Socket.IO + PostgreSQL API/server

The old single-file Flask app flow is deprecated. `app.py` is still in the repo, but it is no longer the primary app entrypoint.

## Project Structure

```text
.
|- frontend/   # React UI
|- backend/    # API, auth, sockets, database
|- package.json
|- README.md
```

## Requirements

- Node.js 20+
- npm
- A PostgreSQL database
- A Groq API key

## Setup

1. Install dependencies from the repo root:

```bash
npm run setup
```

2. Create `backend/.env` from `backend/.env.example` and fill in your values:

```env
DATABASE_URL=postgresql://...
GROQ_API_KEY=your_groq_api_key
SESSION_SECRET=change_this_to_a_long_random_string
PORT=4000
```

Optional backend env vars:

- `GROQ_MODEL` - overrides the default Groq model
- `GROQ_DEBUG_PRINT_FULL_KEY=1` - local debugging only

`backend/.env` is the canonical env file for this app. The backend will also read a repo-root `.env`, but only for missing values.

## Local Development

Run both servers together from the repo root:

```bash
npm run dev
```

This starts:

- React/Vite frontend at `http://localhost:5173`
- Backend API + Socket.IO server at `http://localhost:4000`

The Vite dev server proxies API and socket traffic to the backend, so the React app can talk to the server without extra local config.

## Running Individually

Frontend only:

```bash
npm run dev --prefix frontend
```

Backend only:

```bash
npm run dev --prefix backend
```

## Build

Frontend production build:

```bash
npm run build --prefix frontend
```

Backend production build:

```bash
npm run build --prefix backend
```

Start the compiled backend:

```bash
npm run start --prefix backend
```

In production, the backend serves the built frontend from `frontend/dist`.

## Notes

- The backend initializes the database schema on startup.
- Auth uses server-side sessions via `express-session`.
- Real-time collaboration/presence runs over Socket.IO.
- Shared canvases are available at `/shared/:shareId`.
