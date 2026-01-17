export const PHONE_MAX_LENGTH = 11;

export function sanitizePhone(input: string): string {
  return input.replace(/\D/g, "").slice(0, PHONE_MAX_LENGTH);
}

export function validatePhone11(input: string): boolean {
  return /^\d{11}$/.test(input);
}
