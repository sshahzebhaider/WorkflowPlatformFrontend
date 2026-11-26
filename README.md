# Workflow Platform frontend

React JSX, Vite 6, Ant Design and React Router 6. Keep the existing UI/flow unchanged when maintaining it.

```powershell
Copy-Item .env.example .env.local
npm ci
npm test
npm run build
npm run dev
```

`.env.example` uses the SQL-backed API at `127.0.0.1:5080` in Development. `npm run dev:mock` is a separate frontend-only demo mode. **Do not use mock users or dev-header authentication in production.**

Code style settings: `.prettierrc.json` and `.prettierignore`. JS/JSX has been rewritten with a syntax-aware offline formatter; for canonical Prettier output run the command in the repository's root `README.md` when an approved npm registry is available.
