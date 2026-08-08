/**
 * Single shared password policy, used by every password-setting path:
 * self-service change-password, forgot-password reset, and admin-assisted
 * force-reset. Keeping this in one place means the rule can never drift
 * between those three flows.
 */
const MIN_LENGTH = 10;

export function validatePasswordStrength(password) {
  const problems = [];
  if (!password || password.length < MIN_LENGTH) {
    problems.push(`Password must be at least ${MIN_LENGTH} characters long.`);
  }
  if (!/[a-z]/.test(password || '')) problems.push('Include at least one lowercase letter.');
  if (!/[A-Z]/.test(password || '')) problems.push('Include at least one uppercase letter.');
  if (!/[0-9]/.test(password || '')) problems.push('Include at least one digit.');
  if (!/[^A-Za-z0-9]/.test(password || '')) problems.push('Include at least one symbol.');
  return { valid: problems.length === 0, problems };
}
