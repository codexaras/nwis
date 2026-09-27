# eRTMAC · NWIS — frontend

Next.js 14 (App Router, TypeScript, Tailwind) client for the Nearby Wells Intelligence System. See the repository README for the full project description, architecture and demo script.

```bash
npm install
npm run dev          # http://localhost:3000 (expects the backend on :8000; falls back to /public/demo-data otherwise)
npm run build && npm run start
npm run typecheck && npm run lint
npm run screenshot   # Playwright captures of every route → ../screenshots (+ console-error report)
```

Environment: `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`). Deploys standalone to Vercel with the root directory set to `frontend`.
