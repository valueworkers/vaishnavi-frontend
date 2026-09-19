# Vaishnavi Medicare — Frontend

---

## Prerequisites

| Tool | Minimum Version | Check |
|------|----------------|-------|
| Node.js | 18.x or above | `node -v` |
| npm | 9.x or above | `npm -v` |

---

## Local Development

**Step 1 — Clone the repository**
```bash
git clone <repository-url>
cd <project-folder>
```

**Step 2 — Install dependencies**
```bash
npm install
```
Reads `package.json` and installs all packages into `node_modules/`. Run this once after cloning and again after every `git pull` that changes `package.json`.

**Step 3 — Create the environment file**

Create a `.env` file in the project root (same level as `package.json`):
```env
VITE_BASEURL_CARE=<your-backend-api-base-url>

# Optional — EMR patient records (defaults to browser storage until API exists)
# VITE_ERM_RECORDS_MODE=api

# Optional — public contact & social links (navbar / home hero)
# VITE_CONTACT_PHONE=9187974805
# VITE_CONTACT_EMAIL=connect@vaishnavimedicare.com
# VITE_FACEBOOK_URL=https://www.facebook.com/profile.php?id=61587404186700
# VITE_INSTAGRAM_URL=https://www.instagram.com/vaishnavimedicare/?theme=dark
```
> ⚠️ `.env` is not committed to version control. Ask your team lead for the correct backend URL.

**Step 4 — Start the dev server**
```bash
npm run dev
```
App runs at `http://localhost:5173`

### `npm run dev` — Rules
- Uses **Vite** with hot module replacement (HMR) — edits reflect instantly without a full reload.
- If port `5173` is busy, Vite picks the next free port and prints it in the terminal.
- `.env` must exist and be filled before starting — the app cannot reach the backend without `VITE_BASEURL_CARE`.
- Only `VITE_`-prefixed variables are exposed to the browser bundle. Never expose secrets without this prefix.
- `.env` changes require a **full server restart** — HMR does not pick up env variable changes.
- ESLint runs passively — all errors must be resolved before raising a Pull Request.

---

## Production Build (Release)

**Step 1 — Set the production environment file**
```env
VITE_BASEURL_CARE=https://api.yourdomain.com
```
> ⚠️ The backend URL is baked into the bundle at build time — double-check before building.

**Step 2 — Install dependencies**
```bash
npm install
```

**Step 3 — Build**
```bash
npm run build
```
Vite compiles, minifies, and tree-shakes the app. Output goes into `dist/`. No Node.js needed on the server.

**Step 4 — Preview the build locally**
```bash
npm run preview
```
Serves the `dist/` folder at `http://localhost:4173` — behaves exactly like production. Test all flows here before deploying.

**Step 5 — Deploy `dist/`**

| Target | How |
|--------|-----|
| Nginx / Apache | Point web root to `dist/`. Serve `index.html` for all routes (required for React Router). |
| AWS S3 + CloudFront | Upload `dist/` to S3. Set `index.html` as the default root object. |
| Vercel / Netlify | Build command: `npm run build` · Output directory: `dist` |

**Nginx SPA routing config** (prevents 404 on page refresh):
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

---

## Scripts

| Command | What it does |
|---------|-------------|
| `npm install` | Install all dependencies |
| `npm run dev` | Dev server with HMR at `localhost:5173` |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve `dist/` locally at `localhost:4173` |

---

