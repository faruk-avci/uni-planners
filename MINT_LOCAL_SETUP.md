# Linux Mint compatibility test

This is a clean local smoke test for the UniPlanners code on Linux Mint. It does
not migrate the Windows database or prepare the production server. The goal is to
clone the repository, run every application, and find Linux-specific problems.

## 1. Install requirements

```bash
sudo apt update
sudo apt install -y git postgresql postgresql-contrib build-essential
```

Install Node.js 24 LTS with your preferred Node version manager. If `nvm` is
already installed:

```bash
nvm install 24
nvm use 24
node --version
npm --version
```

## 2. Clone the current code

```bash
git clone https://github.com/faruk-avci/uni-planner.git
cd uni-planner
```

Do not copy the Windows `node_modules` folders. Install Linux-compatible packages:

```bash
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix panel
```

## 3. Create an empty local database

The backend requires PostgreSQL to start. For this compatibility test, create a
fresh empty database; do not export or restore the Windows database.

```bash
sudo -u postgres psql -c "CREATE USER ozu_user WITH PASSWORD 'local-test-password';"
sudo -u postgres createdb --owner=ozu_user ozu_schedule
```

The backend creates its tables when it starts. An empty database means catalog
searches will not contain the current Windows course records, which is expected for
this test. Curriculum and elective JSON files are already included in the repository.

## 4. Configure the local environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
nano backend/.env
```

Use these local values in `backend/.env`:

```dotenv
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=ozu_user
DB_PASSWORD=local-test-password
DB_NAME=ozu_schedule
CORS_ORIGIN=*
COOKIE_SECURE=0
TRUST_PROXY=0
ADMIN_SECRET=local-test-admin-secret-change-me
```

Keep this value in `frontend/.env`:

```dotenv
VITE_DEV_API_PROXY=http://localhost:3001
```

Local `.env` files are ignored by Git.

## 5. Check production builds

Run these before starting the development servers:

```bash
npm run build --prefix frontend
npm run build --prefix panel
node --check backend/server.js
```

All commands should finish without errors.

## 6. Start all three applications

Open three terminals inside the cloned repository:

```bash
# Terminal 1
npm run dev --prefix backend
```

```bash
# Terminal 2
npm run dev --prefix frontend
```

```bash
# Terminal 3
npm run dev --prefix panel
```

Open:

- Website: <http://localhost:5173>
- Admin panel: <http://localhost:5174>
- API health check: <http://localhost:3001/api/health>

## 7. What to test on Mint

- The backend starts without module, worker-thread, PostgreSQL, or `sharp` errors.
- The public website loads and switches between Planner, Curriculum, and How-To.
- The admin panel accepts the `ADMIN_SECRET` from `backend/.env`.
- A curriculum Excel file can be previewed and imported in the panel.
- The frontend and panel can call `/api` through their Vite proxies.
- Schedule image export works on Linux.
- The website opens from a phone on the same network using
  `http://MINT_LAPTOP_IP:5173`.
- No file path assumes Windows drive letters or backslashes.

Write down the exact terminal error and the action that caused it if anything fails.
That gives us a clean list to fix before deploying to the real server.

## Production setup is separate

Do not run `deployment/ubuntu/install-all.sh` for this local test. Those scripts are
for the eventual clean Ubuntu production server and already include the backend,
public frontend, admin panel, PostgreSQL, Nginx, TLS, firewall, and backups.
