# Inventory Dashboard

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set local values as needed.
3. Start the development server:

   ```bash
   npm run dev
   ```

The `.env` file and local SQLite databases are intentionally excluded from Git. Do not
commit service-account JSON files, database files, or other credentials.

## Production build

```bash
npm run make-exe
```

The build creates files under `release/`, which is generated output and is not committed.
