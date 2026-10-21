# Dashboard Builder

A drag-and-drop dashboard editor in the style of Canva or Figma. Add sections, fill them with rich text, images and bar or line charts (one fed live by the server), then move, resize and style everything. Layouts are saved to MySQL and load back on reload.

**Stack:** PHP 8.1+, MySQL 8, plain JavaScript (no build step), interact.js and Chart.js.

## Requirements

- **PHP 8.1+** with `pdo_mysql`, `mbstring`, `fileinfo` and `dom` (usually on by default)
- **MySQL 8.0+**
- **Apache 2.4** with `mod_rewrite`, or PHP's built-in server for local use
- **A current browser with internet access:** Chart.js and interact.js load from cdnjs

## Setup

**1. Create the database and sample data**

```bash
mysql -u root -p < database/schema.sql   # creates the database and tables
mysql -u root -p < database/seed.sql     # adds the "Sales Overview" sample
```

**2. Configure the connection**

```bash
cp .env.example .env
```

Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASS` in `.env`. The defaults are `127.0.0.1:3306`, `dashboard_builder`, `root`, no password.

**3. Run it**

```bash
php -d upload_max_filesize=6M -d post_max_size=8M -S localhost:8000 -t public public/router.php
```

Open **http://localhost:8000**.

**On Apache:** point the site's `DocumentRoot` at `public/` with `AllowOverride All`. Then run `sudo a2enmod rewrite` and make `public/uploads/` writable by the web server. A sub-folder install works too.

**Already have a database from before styles were added?** Run this once instead of step 1. It keeps your dashboards:

```bash
mysql -u root -p < database/migrations/009-styles.sql
```

## Tests

With the server running:

```bash
tests/run.sh
```

This needs Python 3, Node 18+ and Chrome. **It resets the database to the sample data**, so back yours up first with `mysqldump`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Could not connect to the database" | Check the `DB_*` values in `.env`. |
| `/api/...` returns 404 on Apache | Enable `mod_rewrite` and set `AllowOverride All` for `public/`. |
| Image uploads fail | Use the `-d` flags above, and make `public/uploads/` writable. |
| Blank editor, or no charts | The browser couldn't reach cdnjs. Check internet access. |
