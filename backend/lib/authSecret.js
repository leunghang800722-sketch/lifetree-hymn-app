// lib/authSecret.js — JWT signing secret (MEMBERSHIP-PLAN §5.1)
//
// No hardcoded fallback. The old `|| 'hymn-app-jwt-secret-2026'` fallback was
// committed to git, so anyone who saw the repo could forge an admin token.
// Refuse to boot instead of silently signing tokens with a public string.
export const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('🚨 JWT_SECRET env var missing — refusing to start. Set it in the launchd plist EnvironmentVariables (see MEMBERSHIP-PLAN.md §5.1), not in code.');
  process.exit(1);
}
