# Deployment Guide — Vercel (frontend) + Render (backend)

This deploys the FastAPI backend to **Render** and the Next.js frontend to
**Vercel**. The demo uses **SQLite**, re-seeded on every backend build.

> Order matters: deploy the **backend first** to get its URL, then the
> **frontend**, then come back and set the backend's `CORS_ORIGINS`.

---

## 0. Prerequisites
- Code pushed to a **public GitHub repo** (frontend/ and backend/ at the root,
  alongside `render.yaml`).
- Free accounts on [Render](https://render.com) and [Vercel](https://vercel.com).

---

## 1. Backend → Render

1. **New → Blueprint**, select your repo. Render reads `render.yaml` and creates
   a web service named `signal-clone-api` (root dir `backend`).
   - Build: `pip install -r requirements.txt && python -m app.seed`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - `JWT_SECRET` is generated automatically.
2. Click **Apply** / **Create**. Wait for the first deploy to go live.
3. Note the URL, e.g. `https://signal-clone-api.onrender.com`.
4. Quick check: open `https://signal-clone-api.onrender.com/health` → `{"status":"healthy"}`.

> Leave `CORS_ORIGINS` unset for now — you'll fill it in step 3.

---

## 2. Frontend → Vercel

1. **Add New → Project**, import the same repo.
2. **Root Directory**: set to `frontend`.
3. Framework preset: **Next.js** (auto-detected). Leave build/output defaults.
4. **Environment Variables** (convert the Render host to `https`/`wss`):

   | Name                   | Value                                             |
   |------------------------|---------------------------------------------------|
   | `NEXT_PUBLIC_API_URL`  | `https://signal-clone-api.onrender.com`           |
   | `NEXT_PUBLIC_WS_URL`   | `wss://signal-clone-api.onrender.com`             |

5. **Deploy**. Note the URL, e.g. `https://signal-clone.vercel.app`.

---

## 3. Point the backend's CORS at the frontend

1. Render → `signal-clone-api` → **Environment** → add / edit:

   | Name           | Value                                                                      |
   |----------------|----------------------------------------------------------------------------|
   | `CORS_ORIGINS` | `https://signal-clone.vercel.app` (comma-separate if you add more origins) |

2. **Save** → Render redeploys. Once live, the frontend can reach the API + WS.

---

## 4. Verify

1. Open the Vercel URL.
2. Log in with a seeded phone number (`+15550000001` … `+15550000006`) and OTP `123456`.
3. Open a second browser / incognito as a different user and confirm real-time
   messaging, typing indicators, and ✓ / ✓✓ / blue ✓✓ receipts.

---

## Notes & gotchas
- **Free-tier cold starts:** Render free services sleep after inactivity; the
  first request after idle takes ~30–60s. Fine for a demo.
- **SQLite is ephemeral:** data resets whenever Render rebuilds/redeploys. The
  build step re-seeds, so demo users/messages are always present after a deploy.
  For persistent data, provision a Render PostgreSQL instance and set
  `DATABASE_URL` (the code also needs the SQLite-only `connect_args` in
  `backend/app/database.py` made conditional on a `sqlite://` URL).
- **WebSockets** work on Render web services with no extra config; just use
  `wss://` from the frontend.
- Submit **both** links (GitHub repo + Vercel URL) as the assignment deliverables.
