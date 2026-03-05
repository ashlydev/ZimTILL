import React, { useCallback, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { AppButton } from "../../components/AppButton";
import { AppInput } from "../../components/AppInput";
import { useAuth } from "../../contexts/AuthContext";
import { deleteCustomer, listCustomers, saveCustomer } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { colors, spacing } from "../../constants/theme";

export function CustomersScreen() {
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    const rows = await listCustomers(session.merchantId, search);
    setItems(rows);
  }, [session, search]);

  useRefreshOnFocus(load);
  React.useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setPhone("");
    setNotes("");
  };

  const startEdit = (item: Record<string, unknown>) => {
    setEditing(item);
    setName(String(item.name ?? ""));
    setPhone(String(item.phone ?? ""));
    setNotes(String(item.notes ?? ""));
  };

  const onSave = async () => {
    if (!session) return;
    if (!name.trim()) {
      Alert.alert("Missing name", "Customer name is required.");
      return;
    }

    await saveCustomer(
      { merchantId: session.merchantId, deviceId: session.deviceId },
      {
        id: editing ? String(editing.id) : undefined,
        name: name.trim(),
        phone: phone || null,
        notes: notes || null
      }
    );

    resetForm();
    await load();
  };

  const onDelete = async (item: Record<string, unknown>) => {
    if (!session) return;
    Alert.alert("Delete customer", "Soft delete this customer?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteCustomer({ merchantId: session.merchantId, deviceId: session.deviceId }, String(item.id));
          await load();
        }
      }
    ]);
  };

  return (
    <Screen>
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Customers</Text>
        <Text style={styles.subtitle}>Keep customer contacts and notes ready for fast order creation.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Find Customers</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search customers"
          placeholderTextColor={colors.slate}
        />
        <AppButton label="Refresh" variant="secondary" onPress={load} />
      </Card>

      <Card>
        <Text style={styles.formTitle}>{editing ? "Edit Customer" : "Add Customer"}</Text>
        <AppInput label="Name" value={name} onChangeText={setName} />
        <AppInput label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <AppInput label="Notes" value={notes} onChangeText={setNotes} />
        <View style={styles.row}>
          <AppButton label={editing ? "Update" : "Save"} onPress={onSave} />
          {editing ? <AppButton label="Cancel" variant="secondary" onPress={resetForm} /> : null}
        </View>
      </Card>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<Text style={styles.emptyText}>No customers yet. Add one above.</Text>}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.itemTitle}>{String(item.name)}</Text>
            {item.phone ? <Text style={styles.itemMeta}>Phone: {String(item.phone)}</Text> : null}
            {item.notes ? <Text style={styles.itemMeta}>Notes: {String(item.notes)}</Text> : null}
            <View style={styles.row}>
              <AppButton label="Edit" variant="secondary" onPress={() => startEdit(item)} />
              <AppButton label="Delete" variant="secondary" onPress={() => onDelete(item)} />
            </View>
          </Card>
        )}
        scrollEnabled={false}
      />
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
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.dark,
    backgroundColor: colors.background
  },
  formTitle: {
    color: colors.dark,
    fontWeight: "700",
    fontSize: 17
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  itemTitle: {
    color: colors.dark,
    fontSize: 16,
    fontWeight: "700"
  },
  itemMeta: {
    color: colors.slate,
    fontSize: 13
  },
  emptyText: {
    color: colors.slate,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: spacing.md
  }
});
