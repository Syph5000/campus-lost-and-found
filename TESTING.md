# Requirements 6 and 7: where they are implemented and how to demonstrate them

Run the app (`npm run dev`) and follow the "Demonstrate" column in a browser.
You need one student account and one admin account (see README.md, step 4).

## 6. Authentication and access control

| Requirement | Implementation | Demonstrate |
|---|---|---|
| Login | `controllers/authController.js` (`login`), passwords hashed with bcryptjs, generic "Invalid email or password" message | Log in with a wrong password, then the right one |
| Separate admin login | Portal page `/portal`; the Administrator door only admits accounts whose role is `admin` | Student account at the Administrator door shows "not an administrator account" |
| Session management | `express-session`: cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production; new session id on login (prevents session fixation); **60 minute idle timeout** (`rolling`); sessions in MySQL in production | Log in, note the `connect.sid` cookie in DevTools > Application; it changes after login |
| Logout | `POST /logout` destroys the session and clears the cookie (POST + CSRF token so another site cannot log people out) | Click Logout, then press the browser Back button: the protected page is not shown, and you are sent to login |
| Pages not cached after logout | `Cache-Control: no-store` on every signed-in response (`app.js`) | As above |
| Protected pages need login | `requireLogin` (`middleware/auth.js`) on `/report`, `/my-reports`, `/items/:id/edit`, `/claims/*` | While logged out, open `localhost:3000/report`: redirected to login, then returned to the page after signing in |
| Role-based access (RBAC) | `requireRole('admin')` guards **every** route in `routes/admin.js`, plus claim review and report deletion | While logged in as a **student**, type `localhost:3000/admin`, `/admin/users`, `/admin/claims` in the address bar: each shows **403 "You do not have permission"** |
| Role checked on the server, always | The role is re-read from the database on every request (`app.js`), so demoting an admin takes effect immediately, not when the session expires | Admin demotes another admin on the Users tab; that user's next click is refused |
| Hidden buttons are not the only protection | Server-side checks on every action: students cannot delete (403), cannot approve claims (403), cannot edit other people's reports (403) | Hide nothing: send the request by hand and it is still refused |
| CSRF | Token on every POST form, checked in `middleware/csrf.js` | Remove the hidden `_csrf` field in DevTools and submit: 403 |
| Password-guessing protection | `utils/loginLimiter.js`: 5 wrong passwords for an account from one address locks sign-in for 15 minutes (even with the right password) | Enter a wrong password 6 times |

Roles: `student` (report, edit own open report, submit claim tickets) and `admin`
(everything a student can, plus the admin area: reports, claim tickets, users).

## 7. Input validation and data handling

All rules live in one file, `utils/validators.js`, and run on the **server**
before anything is stored (the HTML attributes such as `maxlength` are only a
convenience for the user). Every form shows **all** problems at once with a specific message.

| Data | Checks | Example message |
|---|---|---|
| Full name | required, 2-100 chars, letters/spaces/`'`/`.`/`-` only | "Full name may only contain letters, spaces, apostrophes, periods and hyphens." |
| Student ID | required, 3-30 chars, letters/numbers/hyphens | "Student ID may only contain letters, numbers and hyphens (for example 2021-00123)." |
| Email | required, format, max 100, stored lowercase | "Please enter a valid email address, like name@example.com." |
| Password | required, 8-72 chars (bcrypt limit), at least one letter and one number, must match confirmation | "Password must contain at least one letter and one number." |
| Duplicates | email and student ID checked separately, plus the database `UNIQUE` keys as a backstop for simultaneous sign-ups | "That email address is already registered." |
| Login | email format, password present, generic failure message, lockout | "Invalid email or password." |
| Report: type | must be `lost` or `found` | "Please choose whether you lost or found the item." |
| Report: item name | required, 3-150 chars, whitespace-only = empty | "Item name must be 150 characters or fewer." |
| Report: description | required, 10-2000 chars | "Description must be at least 10 characters." |
| Report: category | must be one of the fixed list | "That category is not valid." |
| Report: location | required, 3-255 chars | "Location is required." |
| Report: date | real calendar date (rejects 2026-02-31), not in the future, not more than 2 years old | "Date cannot be in the future." |
| Photo | JPG/PNG/WEBP/GIF only, max 5 MB, real file signature checked (not just the extension) | "Only JPG, PNG, WEBP or GIF images are allowed." |
| Claim message | required, 10-1000 chars | "Your proof of ownership must be at least 10 characters." |
| URL ids, role values, filters, search text | numeric ids only (else 404), role must be `student`/`admin`, status filters whitelisted, search capped at 100 chars | "Invalid role." |
| Request size | forms limited to 20 KB | "The information you sent was too large." |

Safe data handling:
- **SQL injection:** every query is parameterized (`?` placeholders) and lives in `models/`.
- **XSS:** all output is escaped by EJS (`<%= %>`), so a title like `<script>alert(1)</script>` is shown as text.
- **Uploads:** random file names, type and signature checks, and removal of the file if the form is rejected.
- **Passwords:** stored only as bcrypt hashes, never shown or re-filled into a form.
