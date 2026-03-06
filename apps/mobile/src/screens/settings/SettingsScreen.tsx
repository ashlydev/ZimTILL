import React, { useCallback, useState } from "react";
import { Alert, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Screen } from "../../components/Screen";
import { Card } from "../../components/Card";
import { AppButton } from "../../components/AppButton";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import {
  exportLocalBackup,
  getFeatureFlags,
  getSettings,
  importLocalBackup,
  saveSettings,
  setFeatureFlag
} from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";

export function SettingsScreen() {
  const { session, logout } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [currencyCode, setCurrencyCode] = useState<"USD" | "ZWL">("USD");
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [whatsappTemplate, setWhatsappTemplate] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [backupJson, setBackupJson] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    const [settings, localFlags] = await Promise.all([
      getSettings(session.merchantId),
      getFeatureFlags(session.merchantId)
    ]);

    setBusinessName(String(settings.businessName));
    setCurrencyCode(settings.currencyCode === "ZWL" ? "ZWL" : "USD");
    setCurrencySymbol(String(settings.currencySymbol));
    setPaymentInstructions(String(settings.paymentInstructions));
    setWhatsappTemplate(String(settings.whatsappTemplate));
    setSupportPhone(String(settings.supportPhone ?? ""));
    setSupportEmail(String(settings.supportEmail ?? ""));
    setFlags(localFlags);
  }, [session]);

  useRefreshOnFocus(load);

  const onSave = async () => {
    if (!session) return;
    await saveSettings(
      { merchantId: session.merchantId, deviceId: session.deviceId },
      {
        businessName,
        currencyCode,
        currencySymbol,
        paymentInstructions,
        whatsappTemplate,
        supportPhone: supportPhone || null,
        supportEmail: supportEmail || null
      }
    );
    Alert.alert("Saved", "Settings updated locally and queued for sync.");
  };

  const toggleFlag = async (key: string) => {
    if (!session) return;
    const enabled = !Boolean(flags[key]);
    await setFeatureFlag({ merchantId: session.merchantId, deviceId: session.deviceId }, key, enabled);
    setFlags((prev) => ({ ...prev, [key]: enabled }));
  };

  const onExportBackup = async () => {
    if (!session) return;
    const backup = await exportLocalBackup(session.merchantId);
    const text = JSON.stringify(backup, null, 2);
    setBackupJson(text);
    await Share.share({
      title: "Novoriq Backup",
      message: text
    });
  };

  const onImportBackup = async () => {
    if (!session) return;
    if (!backupJson.trim()) {
      Alert.alert("Missing backup", "Paste backup JSON before importing.");
      return;
    }

    try {
      const parsed = JSON.parse(backupJson) as Record<string, unknown>;
      await importLocalBackup({ merchantId: session.merchantId, deviceId: session.deviceId }, parsed);
      Alert.alert("Imported", "Backup merged into local data.");
      await load();
    } catch {
      Alert.alert("Import failed", "Backup JSON is invalid or unsupported.");
    }
  };

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Business profile, template, support, and feature toggles.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Business</Text>
        <TextInput style={styles.textInput} value={businessName} onChangeText={setBusinessName} placeholder="Business name" />
        <TextInput style={styles.textInput} value={currencySymbol} onChangeText={setCurrencySymbol} placeholder="Currency symbol" />
        <View style={styles.row}>
          <AppButton
            label="USD"
            variant={currencyCode === "USD" ? "primary" : "secondary"}
            onPress={() => setCurrencyCode("USD")}
          />
          <AppButton
            label="ZWL"
            variant={currencyCode === "ZWL" ? "primary" : "secondary"}
            onPress={() => setCurrencyCode("ZWL")}
          />
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>WhatsApp Template</Text>
        <TextInput
          style={[styles.textInput, { minHeight: 110 }]}
          multiline
          value={whatsappTemplate}
          onChangeText={setWhatsappTemplate}
          placeholder="{businessName}..."
        />
        <Text style={styles.meta}>Variables: {`{businessName}`}, {`{orderNumber}`}, {`{items}`}, {`{total}`}, {`{balance}`}, {`{paymentInstructions}`}</Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Payment and Support</Text>
        <TextInput
          style={[styles.textInput, { minHeight: 90 }]}
          multiline
          value={paymentInstructions}
          onChangeText={setPaymentInstructions}
          placeholder="Payment instructions"
        />
        <TextInput style={styles.textInput} value={supportPhone} onChangeText={setSupportPhone} placeholder="Support phone" />
        <TextInput style={styles.textInput} value={supportEmail} onChangeText={setSupportEmail} placeholder="Support email" />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Backup + Restore (Local)</Text>
        <Text style={styles.meta}>Export JSON to share/store securely. Import merges backup into local store.</Text>
        <View style={styles.row}>
          <AppButton label="Export JSON" onPress={onExportBackup} />
          <AppButton label="Import JSON" variant="secondary" onPress={onImportBackup} />
        </View>
        <TextInput
          style={[styles.textInput, { minHeight: 120 }]}
          multiline
          value={backupJson}
          onChangeText={setBackupJson}
          placeholder="Paste backup JSON here to import"
        />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Feature Flags (V2 placeholders)</Text>
        {Object.entries(flags).map(([key, enabled]) => (
          <View key={key} style={styles.rowBetween}>
            <Text style={styles.meta}>{key}</Text>
            <AppButton label={enabled ? "Enabled" : "Disabled"} variant="secondary" onPress={() => toggleFlag(key)} />
          </View>
        ))}
      </Card>

      <AppButton label="Save settings" onPress={onSave} />
      <AppButton label="Logout" variant="secondary" onPress={logout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    gap: spacing.xs
  },
  title: {
    color: colors.navy,
    fontSize: 26,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.slate,
    fontSize: 13
  },
  sectionTitle: {
    color: colors.darkSoft,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  meta: {
    color: colors.slate,
    fontSize: 12,
    flex: 1
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.dark,
    backgroundColor: colors.background,
    minHeight: 46
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md
  }
});
