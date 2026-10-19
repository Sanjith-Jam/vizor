/**
 * Pure logic for SOS contacts, kept dependency-free (no AsyncStorage/React
 * Native import) specifically so it can be unit-tested with plain Node -
 * see contactsStore.ts for the persisted-storage wrapper around this.
 */

export interface SosContact {
  id: string;
  name: string;
  phone: string;
}

export function isValidPhone(phone: string): boolean {
  // Deliberately permissive: spaces, dashes, parens, a leading +, 7-15 digits
  // (E.164 max). This is a sanity check for the UI, not a validator that
  // should reject real numbers.
  const digitsOnly = phone.replace(/[^0-9]/g, "");
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

export function parseContacts(raw: string | null): SosContact[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is SosContact =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as SosContact).id === "string" &&
        typeof (item as SosContact).name === "string" &&
        typeof (item as SosContact).phone === "string",
    );
  } catch {
    return [];
  }
}
