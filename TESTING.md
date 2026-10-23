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

