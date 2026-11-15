# Signup fix — 2026-11-15

The hosted Supabase Site URL still pointed to localhost:3000. It now points to
https://nightwatch-anggunsoracca.vercel.app (saved and reloaded in the dashboard).
Email confirmation remains enabled; ownership continues to use auth.uid().

Changes:
- Signup only requires email and password; display name defaults from email.
- Dedicated confirmation step, resend action, cooldown countdown and in-flight guard.
- Unconfirmed sign-in routes to confirmation guidance.
- Password visibility control; signup-only minimum password length.
- Session restoration rejection exits the loading state with a recoverable message.
- Sending-limit errors explain that repeat signup attempts will not help.

Validation:
- Backend: 88 tests passed, 2 integration/real-model tests deselected.
- Frontend: 18 tests passed, including 4 new signup/confirmation regression tests.
- TypeScript check passed. Production build passed before deployment.
- npm ci audit: zero reported vulnerabilities.

The user's mailbox confirmation and a fresh complete video upload through the
merged frontend remain separate acceptance checks. No account was manually
confirmed or authentication bypassed. No email credentials or paid SMTP added.
