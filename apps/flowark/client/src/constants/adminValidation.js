export const ADMIN_USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
export const ADMIN_USERNAME_HELP = 'El usuario debe tener 3-32 caracteres y solo puede contener letras, números, puntos, guiones bajos o guiones';
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_PASSWORD_MAX_BYTES = 72;

export function isValidAdminUsername(username) {
  return ADMIN_USERNAME_PATTERN.test(String(username || '').trim());
}

export function adminPasswordByteLength(password) {
  return new TextEncoder().encode(String(password || '')).length;
}

export function isValidAdminPassword(password) {
  const value = String(password || '');
  return value.length >= ADMIN_PASSWORD_MIN_LENGTH && adminPasswordByteLength(value) <= ADMIN_PASSWORD_MAX_BYTES;
}

export function adminPasswordValidationMessage(password) {
  const value = String(password || '');
  if (!value) return '';
  if (value.length < ADMIN_PASSWORD_MIN_LENGTH) return `La contraseña debe tener al menos ${ADMIN_PASSWORD_MIN_LENGTH} caracteres`;
  if (adminPasswordByteLength(value) > ADMIN_PASSWORD_MAX_BYTES) return `La contraseña debe ocupar ${ADMIN_PASSWORD_MAX_BYTES} bytes o menos`;
  return '';
}
