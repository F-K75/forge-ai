// Mirrors backend/core/security.py's validate_password_strength exactly --
// keep the two in sync. Used by any flow that sets a *new* password
// (signup, reset); login only checks non-empty, since it validates an
// existing password against the server, not a new one.
export function validateNewPassword(value: string): string | undefined {
  if (!value) return "Password is required";
  if (value.length < 12) return "Password must be at least 12 characters long";
  if (!/[A-Z]/.test(value)) return "Password must contain at least one uppercase letter";
  if (!/[a-z]/.test(value)) return "Password must contain at least one lowercase letter";
  if (!/[0-9]/.test(value)) return "Password must contain at least one number";
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) return "Password must contain at least one special character";
  return undefined;
}
