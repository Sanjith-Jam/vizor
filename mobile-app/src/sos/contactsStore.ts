import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseContacts, type SosContact } from "./contactValidation";

export type { SosContact } from "./contactValidation";
export { isValidPhone } from "./contactValidation";

const STORAGE_KEY = "vizor.sosContacts.v1";

/**
 * Local, on-device emergency contacts (AsyncStorage, not synced anywhere).
 * the sos_contacts table in supabase/migrations/ is the account-level
 * source of truth once this app has its own Supabase auth - see
 * README.md's Next section - this is a standalone fallback for now.
 */

export async function loadContacts(): Promise<SosContact[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return parseContacts(raw);
}

export async function saveContacts(contacts: SosContact[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}
