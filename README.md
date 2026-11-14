# Inventory Dashboard

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set local values as needed.
3. Start the API server in a second terminal:

   ```bash
   npm run dev:server
   ```

4. Start the Vite frontend:

   ```bash
   npm run dev
   ```

   The Vite proxy forwards `/api` requests to `http://localhost:5000`.

For the desktop app during development, use `npm run dev:electron`; it starts
the embedded API server and opens the Electron window.

The `.env` file and local SQLite databases are intentionally excluded from Git. Do not
commit service-account JSON files, database files, or other credentials.

## Production build

```bash
npm run make-exe
```

The build creates files under `release/`, which is generated output and is not committed.
