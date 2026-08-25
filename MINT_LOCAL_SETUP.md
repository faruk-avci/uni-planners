# Running UniPlanners locally on Linux Mint

This guide moves the current local development environment from Windows to Linux
Mint. Git carries the application and the curriculum/elective JSON files, but it
does **not** carry the PostgreSQL database or secrets from `backend/.env`.

## 1. Export the current database on Windows

Before switching to Mint, open PowerShell in the project directory. The current
Windows configuration uses PostgreSQL on port `55432`; change these values if your
`backend/.env` is different.

```powershell
$env:PGPASSWORD = "YOUR_CURRENT_DB_PASSWORD"
pg_dump -h 127.0.0.1 -p 55432 -U ozu_user -d ozu_schedule -Fc -f uniplanner.dump
Remove-Item Env:PGPASSWORD
```

Keep `uniplanner.dump` on a USB drive, shared data partition, or private cloud
storage. Database dumps and `.env` files are intentionally excluded from Git.

If `pg_dump` is not in `PATH`, run the copy inside your PostgreSQL `bin` directory
or call `pg_dump.exe` by its full path.

## 2. Install the local requirements on Mint

Install Git and PostgreSQL:

```bash
sudo apt update
sudo apt install -y git postgresql postgresql-contrib build-essential
```

Install Node.js 24 LTS using your preferred Node version manager. With `nvm` already
installed:

```bash
nvm install 24
nvm use 24
node --version
npm --version
```

Do not copy `node_modules` from Windows. Some dependencies, including `sharp`, need
Linux-specific binaries and will be installed again below.

## 3. Clone and install all three applications

```bash
git clone https://github.com/faruk-avci/uni-planner.git
cd uni-planner
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix panel
```

The repository includes `backend/data`, which contains the curriculum files,
elective pools, and public site settings used by the admin panel and website.

## 4. Create the local PostgreSQL database

Choose a local development password and use the same value in the next section:

```bash
sudo -u postgres psql -c "CREATE USER ozu_user WITH PASSWORD 'CHOOSE_A_LOCAL_PASSWORD';"
sudo -u postgres createdb --owner=ozu_user ozu_schedule
```

If the role or database already exists, do not create it again. You can reset the
role password with:

```bash
sudo -u postgres psql -c "ALTER USER ozu_user WITH PASSWORD 'CHOOSE_A_LOCAL_PASSWORD';"
```

## 5. Restore the Windows database

Copy `uniplanner.dump` somewhere outside the repository, then run:

```bash
PGPASSWORD='CHOOSE_A_LOCAL_PASSWORD' pg_restore \
  -h 127.0.0.1 -p 5432 -U ozu_user -d ozu_schedule \
  --no-owner --role=ozu_user /absolute/path/to/uniplanner.dump
```

The backend creates missing tables when it starts, but restoring the dump is what
preserves the current courses, sections, shares, logs, baskets, and preferences.

## 6. Configure local environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
nano backend/.env
```

For ordinary local Mint development, make sure `backend/.env` contains values like:

```dotenv
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=ozu_user
DB_PASSWORD=CHOOSE_A_LOCAL_PASSWORD
DB_NAME=ozu_schedule
CORS_ORIGIN=*
COOKIE_SECURE=0
TRUST_PROXY=0
ADMIN_SECRET=CHOOSE_A_LONG_RANDOM_ADMIN_SECRET
```

Generate an admin secret if needed:

```bash
openssl rand -hex 48
```

Keep the frontend development proxy pointed at the local backend:

```dotenv
VITE_DEV_API_PROXY=http://localhost:3001
```

Never commit either `.env` file.

## 7. Start UniPlanners

Open three terminals in the cloned repository:

```bash
# Terminal 1: API
npm run dev --prefix backend
```

```bash
# Terminal 2: public website
npm run dev --prefix frontend
```

```bash
# Terminal 3: admin panel
npm run dev --prefix panel
```

Open:

- Website: <http://localhost:5173>
- Admin panel: <http://localhost:5174>
- API health check: <http://localhost:3001/api/health>

The website and panel development servers listen on `0.0.0.0`, so they can also be
opened from another device on the same home network using the Mint laptop's local IP.
Do not expose the development ports directly to the internet.

## Production setup is separate

The scripts in `deployment/ubuntu` are for a clean Ubuntu 24.04 production server,
not for routine local Mint development. The production installer already installs
and builds the backend, public frontend, and admin panel, and configures both
`uniplanner.org` and `panel.uniplanner.org` in Nginx.
