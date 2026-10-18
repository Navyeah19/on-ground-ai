# On-Ground.ai Call Centre

On-Ground.ai is a local-development call-centre workspace built with React and Vite. It brings customer follow-up management, call signalling, browser voice calls and operational views into one agent dashboard. Call and customer data is stored locally by the Express backend in JSON files.

## Features

- **Dashboard** — Agent workspace overview.
- **Calls to Make** — Customer list and outgoing browser voice calls.
- **Incoming Calls** — Incoming-call history and agent controls.
- **Browser-to-browser voice calling** — LiveKit audio with microphone mute and end-call controls. A global notification lets agents answer incoming calls while viewing any workspace page.
- **Recent Calls** — Persisted call history with status and duration details where available.
- **Calendar** — Create, edit, reschedule and delete follow-up call appointments.
- **Pulse Analytics** — Call metrics, daily activity and outcomes calculated from saved call history.
- **Leads Management** — Search, filter and manage lead details, statuses, priorities and notes.

## Technology

- React 19 and Vite 8
- Node.js and Express 5
- LiveKit JavaScript client and server SDKs
- Socket.IO for incoming-call signalling
- Lucide React icons
- Oxlint
- Local JSON files for call history, scheduled calls and leads

## Prerequisites

- Node.js `20.19+` or `22.12+` and npm (required by the installed Vite version)
- A LiveKit project or server and its API key, API secret and server URL
- A browser with microphone access for voice-call testing

## Setup

1. Install dependencies from the project root:

   ```bash
   npm install
   ```

2. Create a root-level `.env` file. Use your own values locally; never add this file to source control:

   ```dotenv
   LIVEKIT_API_KEY=<your-livekit-api-key>
   LIVEKIT_API_SECRET=<your-livekit-api-secret>
   LIVEKIT_URL=<your-livekit-server-url>
   ```

   These variables are read by `server.js`. The API secret is not read by the React frontend. No `VITE_` credentials are required.

## Run locally

Open two terminals in the project root.

**Terminal 1 — Express, LiveKit token service and Socket.IO:**

```bash
node server.js
```

The backend listens on `127.0.0.1:3001`.

**Terminal 2 — Vite frontend:**

```bash
npm run dev -- --host 127.0.0.1 --port 5175
```

Open the URL printed by Vite (normally `http://localhost:5175`). The backend CORS configuration also permits the Vite origin on port `5173`.

Useful project checks:

```bash
npm run build
npm run lint
node --check server.js
```

## Test a browser-to-browser call

1. Open `http://localhost:5175/` in one browser window. This is the agent workspace; it registers with the local Socket.IO service.
2. Open `http://localhost:5175/?customerTest=1` in a second window or browser. If Vite selected another port, use that port in the URL.
3. Enter a display name on the customer test page and select **Call Agent**.
4. In the agent window, accept the incoming-call notification. Both browsers then request separate access tokens and join the same LiveKit room with different participant identities.
5. Allow microphone access in both browsers. Use **Mute/Unmute** and **End Call** to test the audio controls.

The customer test page does not call the entered name's telephone number. To test other signaling outcomes, reject the request from the agent window or cancel it from the customer window while it is ringing.

## Project structure

```text
.
├── server.js                  # Express APIs, Socket.IO signalling and LiveKit token generation
├── package.json               # Dependencies and npm scripts
├── vite.config.js             # Vite and React plugin configuration
├── .env                       # Local LiveKit variables; ignored by Git
├── data/                      # Runtime JSON persistence; customer data is ignored by Git
└── src/
    ├── App.jsx                # Sidebar navigation and workspace page rendering
    ├── CallsToMake.jsx        # Outgoing call workflow
    ├── IncomingCalls.jsx      # Agent incoming-call history
    ├── GlobalIncomingCall.jsx # Shared agent Socket.IO state and global call UI
    ├── CustomerCall.jsx       # Local customer test page and call request flow
    ├── VoiceCall.jsx          # LiveKit browser audio component
    ├── RecentCalls.jsx        # Persisted call history page
    ├── Calendar.jsx           # Scheduled follow-up calls
    ├── Pulse.jsx              # Call analytics
    └── Leads.jsx              # Lead management
```

The backend creates `data/calls.json`, `data/scheduled-calls.json` and `data/leads.json` as records are saved. These files contain local application data and are excluded from Git.

## Local API overview

- `POST /get-token` — Creates a short-lived LiveKit access token for a room participant.
- `/api/calls` — Reads and records call history and call lifecycle updates.
- `/api/scheduled-calls` — Creates, reads, updates and deletes scheduled calls.
- `/api/leads` — Creates, reads, updates and deletes leads.
- Socket.IO — Registers the local agent and coordinates incoming, accepted, rejected and cancelled call requests.

## Limitations and security

- Voice calling is **browser-to-browser LiveKit audio**. It is not a telephone dialer and does not place calls on the public phone network.
- The Express APIs, token endpoint and agent registration are unauthenticated local-development functionality. The server binds to loopback for local use. Add authentication, authorization, access controls and deployment security before exposing any endpoint publicly.
- Call signalling and pending incoming calls are held in server memory; they do not survive a backend restart. Call history, scheduled calls and leads are persisted locally as JSON, not in a production database.
- Microphone access and a reachable LiveKit server are required for a real voice test. This README does not imply that a two-person call has been tested.
