import React, { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Contact, requestPermissionsAsync } from "expo-contacts";
import { AppText, Banner, Button, Card, EmptyState, Screen, SectionTitle } from "../components/ui";
import { loadContacts, saveContacts, isValidPhone } from "../sos/contactsStore";
import type { SosContact } from "../sos/contactValidation";
import { smsUrl } from "../sos/crashMessage";
import { colors, fonts, radius, spacing, TOUCH_TARGET } from "../theme";

const TEST_MESSAGE =
  "Test from my AR helmet app: you're one of my emergency contacts. If I crash, you'll get a message with my location. No action needed.";

/**
 * Local, on-device emergency contacts (see contactsStore.ts). The first
 * contact is the primary one and is listed first on the SOS screen.
 */
export default function ContactsScreen() {
  const [contacts, setContacts] = useState<SosContact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    loadContacts()
      .then(setContacts)
      .finally(() => setLoaded(true));
  }, []);

  const persist = async (next: SosContact[]) => {
    setContacts(next);
    await saveContacts(next);
  };

  const valid = name.trim().length > 0 && isValidPhone(phone);

  const submit = async () => {
    if (!valid) return;
    if (editingId) {
      await persist(contacts.map((c) => (c.id === editingId ? { ...c, name: name.trim(), phone: phone.trim() } : c)));
    } else {
      await persist([...contacts, { id: `${Date.now()}`, name: name.trim(), phone: phone.trim() }]);
    }
    setName("");
    setPhone("");
    setEditingId(null);
  };

  const pickFromPhonebook = async () => {
    setPickerError(null);
    try {
      const picked = await Contact.presentPicker();
      if (!picked) return;
      // Reading the picked contact's number needs contacts access on Android.
      const perm = await requestPermissionsAsync();
      if (!perm.granted) {
        setPickerError("Contacts access was denied - type the details instead.");
        return;
      }
      const [fullName, phones] = await Promise.all([picked.getFullName(), picked.getPhones()]);
      const number = phones.find((p) => p.number)?.number ?? "";
      setName(fullName);
      setPhone(number);
      if (!number) setPickerError("That contact has no phone number - type one in.");
    } catch {
      setPickerError("Couldn't open your contacts. You can type the details instead.");
    }
  };

  const remove = (c: SosContact) => {
    Alert.alert(`Remove ${c.name}?`, "They won't be shown on the SOS screen any more.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void persist(contacts.filter((x) => x.id !== c.id)) },
    ]);
  };

  const makePrimary = (c: SosContact) => void persist([c, ...contacts.filter((x) => x.id !== c.id)]);

  const edit = (c: SosContact) => {
    setEditingId(c.id);
    setName(c.name);
    setPhone(c.phone);
  };

  return (
    <Screen>
      <AppText variant="small" color={colors.textMuted}>
        If a crash is detected and not cancelled within 10 seconds, these people are shown on a full-screen SOS page so
        you or anyone holding your phone can call or text them your location in one tap.
      </AppText>

      {loaded && contacts.length === 0 ? (
        <EmptyState icon="people" title="No emergency contacts" message="Add a family member or friend below." />
      ) : null}

      {contacts.map((c, i) => (
        <Card key={c.id} style={styles.contactCard}>
          <View style={styles.contactTop}>
            <View style={styles.avatar}>
              <AppText weight="bold" color={colors.accent}>
                {c.name.slice(0, 1).toUpperCase()}
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText weight="bold">{c.name}</AppText>
              <AppText variant="small" color={colors.textMuted}>
                {c.phone}
              </AppText>
            </View>
            {i === 0 ? (
              <View style={styles.primaryBadge}>
                <AppText variant="caption" weight="bold" color={colors.onAccent}>
                  PRIMARY
                </AppText>
              </View>
            ) : null}
          </View>
          <View style={styles.actions}>
            {i !== 0 ? <IconAction icon="star-outline" label="Make primary" onPress={() => makePrimary(c)} /> : null}
            <IconAction icon="create-outline" label="Edit" onPress={() => edit(c)} />
            <IconAction
              icon="chatbubble-outline"
              label="Send test"
              onPress={() => void Linking.openURL(smsUrl(c.phone, TEST_MESSAGE))}
            />
            <IconAction icon="trash-outline" label="Remove" danger onPress={() => remove(c)} />
          </View>
        </Card>
      ))}

      <SectionTitle>{editingId ? "Edit contact" : "Add contact"}</SectionTitle>
      <Button label="Choose from phone contacts" icon="person-add" variant="secondary" onPress={() => void pickFromPhonebook()} />
      {pickerError ? <Banner tone="warning" title={pickerError} /> : null}
      <TextInput
        style={styles.input}
        placeholder="Name"
        placeholderTextColor={colors.textFaint}
        value={name}
        onChangeText={setName}
        accessibilityLabel="Contact name"
      />
      <TextInput
        style={styles.input}
        placeholder="Phone number (with country code)"
        placeholderTextColor={colors.textFaint}
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        accessibilityLabel="Contact phone number"
      />
      {phone.length > 0 && !isValidPhone(phone) ? (
        <AppText variant="small" color={colors.danger}>
          That doesn't look like a valid phone number.
        </AppText>
      ) : null}
      <Button label={editingId ? "Save changes" : "Add contact"} icon="checkmark" disabled={!valid} onPress={() => void submit()} />
      {editingId ? (
        <Button
          label="Cancel editing"
          variant="ghost"
          onPress={() => {
            setEditingId(null);
            setName("");
            setPhone("");
          }}
        />
      ) : null}
    </Screen>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? colors.danger : colors.accent;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconAction}>
      <Ionicons name={icon} size={20} color={color} />
      <AppText variant="caption" weight="semibold" color={color}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  contactCard: {
    gap: spacing.md,
  },
  contactTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: {
    flex: 1,
  },
  primaryBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  iconAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  input: {
    minHeight: TOUCH_TARGET,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 16,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
});
