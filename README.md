# Campus Lost and Found

## Setup
1. `npm install`
2. Create the database: `mysql -u root -p < db/schema.sql`
3. `cp .env.example .env` and fill it in (SESSION_SECRET is required; the app refuses to start without it).
4. Create an administrator:
   `ADMIN_PASSWORD='your-password' node scripts/create-admin.js "Admin Name" admin@example.com ADMIN-001`
5. `npm run dev` then open http://localhost:3000

Students register themselves at `/register`. Admins can manage any report or claim and use the dashboard at `/admin`.

## Project layout
- `routes/` maps URLs to controller functions and applies middleware (login, roles, uploads).
- `controllers/` validates input and decides what to render or redirect to.
- `models/` is the only place that contains SQL.
- `views/` EJS templates (`views/admin/` for the admin area).
- `middleware/` auth/roles, CSRF, uploads.

## Features
- Report lost/found items with an optional photo; **owners and admins can edit open reports** (type is locked; photo can be replaced or removed).
- Claims with approve/reject by the reporter or an admin.
- **Admin area** (`/admin`): overview stats, all reports with filters, user list with promote/demote. An admin cannot change their own role.
- Roles are re-read from the database on every request, so promoting or demoting someone takes effect immediately.

## Deployment notes
- Set `NODE_ENV=production`. Sessions are then stored in MySQL (table auto-created) and cookies are `Secure`, so serve over HTTPS.
- Every POST form includes a CSRF token (`middleware/csrf.js`). New multipart routes must call `verifyCsrf` after their multer middleware.
- Admin-only routes should use `requireRole('admin')` from `middleware/auth.js`.

## Security and validation
See `TESTING.md` for how requirements 6 (authentication and access control) and 7 (input validation) are met and how to demonstrate each one.
