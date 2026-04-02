import {
  getExampleNumber,
  isSupportedCountry,
  type CountryCode,
} from "libphonenumber-js";
import parsePhoneNumberFromString from "libphonenumber-js/max";
import mobileExamples from "libphonenumber-js/mobile/examples";
import { getPhoneCountryByIso } from "./phoneCountries";

export const PHONE_MAX_LENGTH = 11;
export const DEFAULT_CALLING_CODE = "+63";
export const CALLING_CODE_MAX_LENGTH = 4;
export const INTERNATIONAL_PHONE_DIGIT_MIN_LENGTH = 7;
export const INTERNATIONAL_PHONE_DIGIT_MAX_LENGTH = 15;

function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

function normalizeCountryIso2(countryIso2: string): CountryCode | undefined {
  const normalized = countryIso2.trim().toUpperCase();
  return isSupportedCountry(normalized) ? normalized : undefined;
}

function getPhoneExample(countryIso2: string) {
  const countryCode = normalizeCountryIso2(countryIso2);
  return countryCode ? getExampleNumber(countryCode, mobileExamples) : undefined;
}

function parsePhoneForCountry(countryIso2: string, input: string) {
  const countryCode = normalizeCountryIso2(countryIso2);
  const trimmed = input.trim();
  if (!countryCode || !trimmed) return undefined;

  const candidate =
    trimmed.startsWith("+") || trimmed.startsWith("00")
      ? normalizeInternationalPhone(trimmed)
      : digitsOnly(trimmed);

  if (!candidate) return undefined;

  return parsePhoneNumberFromString(candidate, countryCode);
}

export function sanitizePhone(input: string): string {
  return digitsOnly(input).slice(0, PHONE_MAX_LENGTH);
}

export function validatePhone11(input: string): boolean {
  return /^\d{11}$/.test(input);
}

export function sanitizeCallingCode(input: string): string {
  const digits = digitsOnly(input).slice(0, CALLING_CODE_MAX_LENGTH - 1);
  return digits ? `+${digits}` : "";
}

export function normalizeCallingCode(
  input: string,
  fallback = DEFAULT_CALLING_CODE
): string {
  const sanitized = sanitizeCallingCode(input);
  return sanitized || fallback;
}

export function isPhilippineCallingCode(input: string): boolean {
  return normalizeCallingCode(input, "") === DEFAULT_CALLING_CODE;
}

export function normalizePhilippineMobile(input: string): string {
  const digits = digitsOnly(input);
  if (!digits) return "";

  if (digits.startsWith("63")) {
    let national = digits.slice(2);
    if (national.startsWith("0")) national = national.slice(1);
    if (national.startsWith("9")) {
      return `0${national.slice(0, PHONE_MAX_LENGTH - 1)}`;
    }
  }

  if (digits.startsWith("09")) {
    return digits.slice(0, PHONE_MAX_LENGTH);
  }

  if (digits.startsWith("9")) {
    return `0${digits.slice(0, PHONE_MAX_LENGTH - 1)}`;
  }

  return digits.slice(0, PHONE_MAX_LENGTH);
}

export function getPhoneExampleLocalNumber(countryIso2: string): string {
  return getPhoneExample(countryIso2)?.nationalNumber ?? "";
}

export function normalizePhoneInputForCountry(
  countryIso2: string,
  input: string
): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const parsed = parsePhoneForCountry(countryIso2, trimmed);
  if (parsed?.nationalNumber) {
    return parsed.nationalNumber.slice(0, getPhoneLocalMaxLength(countryIso2));
  }

  const digits = digitsOnly(trimmed);
  if (!digits) return "";

  const country = getPhoneCountryByIso(countryIso2);
  const dialDigits = digitsOnly(country?.dialCode ?? "");
  const expectedDigits = getPhoneExampleLocalNumber(countryIso2).length;

  if (dialDigits && digits.startsWith(dialDigits) && digits.length > dialDigits.length) {
    return digits
      .slice(dialDigits.length)
      .slice(0, getPhoneLocalMaxLength(countryIso2));
  }

  if (expectedDigits && digits.startsWith("0") && digits.length === expectedDigits + 1) {
    return digits.slice(1).slice(0, getPhoneLocalMaxLength(countryIso2));
  }

  return digits.slice(0, getPhoneLocalMaxLength(countryIso2));
}

export function getPhoneLocalMaxLength(countryIso2: string): number {
  const example = getPhoneExampleLocalNumber(countryIso2);
  if (example) return example.length;

  const normalizedCode = normalizeCallingCode(
    getPhoneCountryByIso(countryIso2)?.dialCode ?? DEFAULT_CALLING_CODE
  );
  const codeDigits = digitsOnly(normalizedCode);
  return Math.max(4, INTERNATIONAL_PHONE_DIGIT_MAX_LENGTH - codeDigits.length);
}

export function normalizeInternationalPhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const digits = digitsOnly(trimmed);
  if (!digits) return "";

  if (trimmed.startsWith("00")) {
    return `+${digits.slice(2)}`;
  }

  return `+${digits}`;
}

export function validateInternationalPhone(input: string): boolean {
  const digits = normalizeInternationalPhone(input).replace(/\D/g, "");
  return (
    digits.length >= INTERNATIONAL_PHONE_DIGIT_MIN_LENGTH &&
    digits.length <= INTERNATIONAL_PHONE_DIGIT_MAX_LENGTH
  );
}

export function normalizePhoneForStorage(
  countryIso2: string,
  callingCode: string,
  phoneInput: string
): string {
  const localDigits = normalizePhoneInputForCountry(countryIso2, phoneInput);
  if (!localDigits) return "";

  const parsed = parsePhoneForCountry(countryIso2, localDigits);
  if (parsed?.isValid()) {
    return normalizeCountryIso2(countryIso2) === "PH"
      ? `0${parsed.nationalNumber}`
      : parsed.number;
  }

  const normalizedCode = normalizeCallingCode(callingCode);
  if (isPhilippineCallingCode(normalizedCode)) {
    return /^9\d{9}$/.test(localDigits)
      ? `0${localDigits}`
      : normalizePhilippineMobile(phoneInput);
  }

  const codeDigits = digitsOnly(normalizedCode);
  return codeDigits && localDigits ? `+${codeDigits}${localDigits}` : "";
}

export function formatPhoneForRegistrationError(
  countryIso2: string,
  phoneInput: string,
  show: boolean
): string | undefined {
  const normalizedInput = normalizePhoneInputForCountry(countryIso2, phoneInput);
  if (!show || !normalizedInput) return undefined;

  const country = getPhoneCountryByIso(countryIso2);
  const countryLabel = country?.name ?? "selected country";
  const parsed = parsePhoneForCountry(countryIso2, normalizedInput);

  if (parsed?.isValid()) {
    return undefined;
  }

  const expectedDigits = getPhoneExampleLocalNumber(countryIso2).length;
  if (expectedDigits && normalizedInput.length !== expectedDigits) {
    return `Enter a valid ${countryLabel} number. It should have ${expectedDigits} digits.`;
  }

  return `Enter a valid ${countryLabel} phone number.`;
}

export function normalizePhoneLookupKey(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const normalizedPh = normalizePhilippineMobile(trimmed);
  if (/^09\d{9}$/.test(normalizedPh)) {
    return normalizedPh;
  }

  const normalizedIntl = normalizeInternationalPhone(trimmed);
  if (validateInternationalPhone(normalizedIntl)) {
    return normalizedIntl;
  }

  return trimmed;
}

export function buildPhoneLookupVariants(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);
  const digits = digitsOnly(trimmed);
  if (digits) variants.add(digits);

  const normalized = normalizePhoneLookupKey(trimmed);
  if (normalized) {
    variants.add(normalized);
    if (normalized.startsWith("+")) {
      variants.add(normalized.slice(1));
    }
  }

  const normalizedPh = normalizePhilippineMobile(trimmed);
  if (/^09\d{9}$/.test(normalizedPh)) {
    const mobileCore = normalizedPh.slice(1);
    variants.add(normalizedPh);
    variants.add(mobileCore);
    variants.add(`63${mobileCore}`);
    variants.add(`+63${mobileCore}`);
  }

  return Array.from(variants);
}

export function arePhonesEquivalent(a: string, b: string): boolean {
  const aVariants = new Set(buildPhoneLookupVariants(a));
  return buildPhoneLookupVariants(b).some((variant) => aVariants.has(variant));
}
