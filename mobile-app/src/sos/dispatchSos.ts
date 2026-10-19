import { Linking } from "react-native";
import type { SosContact } from "./contactValidation";
import { telUrl, smsUrl } from "./crashMessage";

export { crashLocationMessage } from "./crashMessage";

/**
 * Opens the native dialer/SMS composer for a contact. Neither Android nor
 * iOS lets a normal app silently place a call or send an SMS - that needs
 * default-dialer status or carrier-level permissions that wouldn't pass
 * standard app review - so this is the realistic "one tap for whoever's
 * holding the phone" version, not a fictional silent auto-dispatch.
 */
export function callContact(contact: SosContact): Promise<void> {
  return Linking.openURL(telUrl(contact.phone));
}

export function textContact(contact: SosContact, message: string): Promise<void> {
  return Linking.openURL(smsUrl(contact.phone, message));
}
