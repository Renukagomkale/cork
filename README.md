# Cork

A real-time collaborative moodboard. Pin notes, colors and links on an infinite canvas, share the board with a link and watch other people's cursors and edits appear live.



![A Cork board]

## Why it exists

Moodboards are usually built alone in a design tool and then screenshotted into a chat. Cork keeps the board in one place that a whole team can edit at the same time, with no account needed for the people you invite.

## Features

- Infinite canvas with pan, cursor-centered zoom, drag, resize and layering
- Notes, color swatches and link cards
- Live collaboration: edits, presence avatars and cursors of everyone on the board
- Undo and redo that stays correct when other people are editing
- Share links with view or edit access, optional expiry and instant revocation
- Guests join with just a name, no account
- Reconnects automatically and reloads the latest board state
- Loading, empty and error states, and a layout that works on small screens


## Tech stack

| Part | Choice |
|---|---|
| Frontend | React 18 (Vite), Tailwind CSS 4, React Router, Axios, socket.io-client, Lucide icons |
| Backend | Node.js 20, Express 5, Socket.io 4 |
| Database | MongoDB with Mongoose |
| Validation | Zod |
| Auth | JWT (HS256), bcrypt password hashing |
| Tests | Node's built-in test runner, supertest, socket.io-client, mongodb-memory-server |

## How it works

```
React client  --REST (boards, auth, share links)-->  Express  -->  MongoDB
      |                                                 |
      +------ WebSocket (items, cursors, presence) -----+
```

1. A client opens a board and sends `board:join`. The server checks access in the database and replies with a full snapshot of the board, so a reconnecting phone is never stale.
2. When you drag, resize, add, edit or delete, the change is applied on your screen immediately and sent to the server.
3. The server validates it, checks you are allowed to edit, writes it to MongoDB and broadcasts it to everyone else in the board's room.
4. Cursors are sent as volatile messages. They are never stored and are dropped if the network is slow.

### How edits stay consistent

- Every item is its own MongoDB document, and updates only `$set` the fields that changed. Two people editing different fields of the same item both win. Editing the same field is last write wins. This is not a CRDT.
- Item ids are created by the client (a MongoDB ObjectId). That lets the client show a new item instantly and lets "undo delete" bring back the same id. The server rejects an id that already exists.
- Undo and redo store the inverse of what you changed, not a copy of the whole board. Undoing your move does not erase someone else's edit to another item.
- Dragging sends updates about every 70 ms, and the final position is sent when you let go.

## Security

- Passwords are hashed with bcrypt. Login errors do not reveal whether an email exists.
- Share tokens are random and only a SHA-256 hash is stored. The token is shown once when the link is created.
- A guest token is a short-lived JWT tied to one board and one link. It cannot call the account API.
- Access is checked on the server for every REST request and every WebSocket event. For guests the link is checked again on every edit, and revoking a link disconnects its guests immediately.
- Other people's boards return 404, not 403, so their existence is not revealed.
- Requests are validated with Zod and unknown fields are rejected. Limits: 50 boards per person, 500 items per board, 10 active links per board.
- Rate limits on login, register and joining a share link, and per-socket limits on edits and cursors. CORS is restricted to the frontend URL.

## Run it on Windows

You need Node.js 20.6 or newer and a MongoDB database. Use either MongoDB running on your PC (`mongodb://127.0.0.1:27017/cork`) or a free MongoDB Atlas cluster. Pick one and use it in `MONGODB_URI`.

Backend:

```powershell
cd backend
npm install
copy .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Put the generated value after `JWT_SECRET=` in `backend\.env`, set `MONGODB_URI`, then:

```powershell
npm run seed
npm run dev
```

Frontend, in a second terminal:

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open http://localhost:5173. Vite reads `.env` only at startup, so restart it after editing. `npm run seed` creates a demo account (`demo@cork.test` with password `Demo-pass-2026`), a filled board and a guest link, and prints them. `npm run seed:reset` rebuilds the demo data. To show a "Try the demo board" button on the login page, set `VITE_DEMO_EMAIL` and `VITE_DEMO_PASSWORD` in `frontend\.env`.

## Environment variables

Backend (`backend/.env`):

| Name | Purpose |
|---|---|
| PORT | Port for the API, default 4000 |
| MONGODB_URI | MongoDB connection string |
| JWT_SECRET | Required, at least 32 random characters |
| CLIENT_URL | Allowed frontend origin. Several can be comma separated. |
| NODE_ENV | Set to `production` when deployed |

Frontend (`frontend/.env`):

| Name | Purpose |
|---|---|
| VITE_API_URL | API base URL, for example `http://localhost:4000/api` |
| VITE_SOCKET_URL | Socket server URL, for example `http://localhost:4000` |
| VITE_DEMO_EMAIL, VITE_DEMO_PASSWORD | Optional. Shows the demo button on the login page. |

## API reference

REST paths are under `/api`. Errors look like `{"message": "...", "errors": {...}}`.

| Method and path | Who | What |
|---|---|---|
| POST `/auth/register`, `/auth/login` | anyone | Returns the user and a token |
| GET `/auth/me` | signed in | Current user |
| GET, POST `/boards` | signed in | List your boards (paginated) or create one |
| GET, PATCH, DELETE `/boards/:id` | owner | Read with items, rename, delete |
| POST `/boards/:id/items` | owner | Create an item |
| PATCH, DELETE `/boards/:id/items/:itemId` | owner | Change or delete an item |
| GET, POST `/boards/:id/share` | owner | List active links, create a link (token returned once) |
| DELETE `/boards/:id/share/:linkId` | owner | Revoke a link |
| GET `/share/:token` | anyone with the link | Board title and access level |
| POST `/share/:token/join` | anyone with the link | Join as a guest with a name |

Socket events from the client (each is acknowledged with `ok: true` or `ok: false`):

| Event | What |
|---|---|
| `board:join`, `board:leave` | Enter or leave a board, join returns a full snapshot |
| `item:create`, `items:update`, `item:delete` | Change the board (edit access only) |
| `cursor:move` | Share your cursor position |

Events from the server: `item:created`, `items:updated`, `item:deleted`, `cursor:moved`, `presence:joined`, `presence:left`, `board:renamed`, `board:deleted`, `access:revoked`.

## Tests

```powershell
cd backend
npm test
```

There are 64 tests covering auth, boards, items, the real-time events, sharing and guest permissions, and the seed data. They run against an in-memory MongoDB, so they never touch your real data. The first run downloads a MongoDB binary of about 600 MB, so keep a few GB of disk free. Test files run one at a time to keep this stable.

## Limitations

- There are no automated tests for the React code. The frontend was tested by hand.
- Conflicts are last write wins per field. There is no CRDT.
- Edits made while offline are not queued. The board becomes read-only until it reconnects.
- Tokens are kept in `localStorage` and a user token lasts 7 days with no refresh. An httpOnly cookie would be safer.
- Items are DOM elements, which is why a board is capped at 500 items.
- Pinch to zoom is not supported on touch screens yet. One-finger panning works.
- Socket.io rooms live in memory, so the backend runs as a single instance. Scaling out would need the Redis adapter.
- Guests can be removed by revoking their link, but not one by one.

## Future work

- Image upload and link previews
- Pinch zoom, a selection box and snapping guides
- Yjs for conflict-free text editing
- Comments and export to PNG
- Redis adapter for several backend instances

## Deployment

Frontend on Vercel, backend on Render, database on MongoDB Atlas. Free tiers change, so check their current limits.

1. Atlas: create a free cluster, a database user and copy the connection string with `/cork` as the database name. Allow the backend to connect in Network Access.
2. Render web service: root directory `backend`, build command `npm install`, start command `npm start`. Set `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` and `CLIENT_URL` (your Vercel URL without a trailing slash).
3. Vercel: root directory `frontend`. Set `VITE_API_URL` to your Render URL plus `/api`, and `VITE_SOCKET_URL` to your Render URL. `vercel.json` makes page refreshes work.
4. Demo data: from your own machine run `$env:MONGODB_URI="<atlas string>"; npm run seed` inside `backend`.

On a free Render instance the first request after a quiet period can take a while while the server wakes up.
