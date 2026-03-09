import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { AppButton } from "../../components/AppButton";
import { AppInput } from "../../components/AppInput";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { colors, spacing } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthContext";
import { deleteCategory, listCategories, saveCategory } from "../../data/repository";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";

export function CategoriesScreen() {
  const { session } = useAuth();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const rows = await listCategories(session.merchantId);
    setItems(rows);
  }, [session]);

  useRefreshOnFocus(load);
  React.useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setName("");
    setEditingId(null);
  };

  const onSave = async () => {
    if (!session || !name.trim()) {
      Alert.alert("Missing category", "Enter a category name first.");
      return;
    }

    setBusy(true);
    try {
      await saveCategory(
        { merchantId: session.merchantId, userId: session.userId, deviceId: session.deviceId },
        { id: editingId ?? undefined, name: name.trim() }
      );
      resetForm();
      await load();
    } catch (error) {
      Alert.alert("Unable to save category", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (item: Record<string, unknown>) => {
    if (!session) return;
    Alert.alert("Delete category", "Products keep working, but this category will be removed from filters and reports.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteCategory(
            { merchantId: session.merchantId, userId: session.userId, deviceId: session.deviceId },
            String(item.id)
          );
          await load();
        }
      }
    ]);
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.title}>Categories</Text>
        <Text style={styles.subtitle}>Organize products once, then reuse the same categories across stock, sales, and reports.</Text>
      </View>

      <Card>
        <Text style={styles.sectionTitle}>{editingId ? "Edit Category" : "Add Category"}</Text>
        <AppInput label="Category Name" value={name} onChangeText={setName} />
        <View style={styles.row}>
          <AppButton label={busy ? "Saving..." : editingId ? "Update Category" : "Save Category"} onPress={() => void onSave()} loading={busy} />
          {editingId ? <AppButton label="Cancel" variant="secondary" onPress={resetForm} /> : null}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Category List</Text>
        {items.length === 0 ? <Text style={styles.meta}>No categories yet. Add your first one above.</Text> : null}
        <View style={styles.listWrap}>
          {items.map((item) => (
            <View key={String(item.id)} style={styles.itemRow}>
              <View style={styles.itemMain}>
                <Text style={styles.itemTitle}>{String(item.name)}</Text>
                <Text style={styles.meta}>Synced across every owner and staff device for this merchant.</Text>
              </View>
              <View style={styles.itemActions}>
                <AppButton
                  label="Edit"
                  variant="secondary"
                  onPress={() => {
                    setEditingId(String(item.id));
                    setName(String(item.name ?? ""));
                  }}
                />
                <AppButton label="Delete" variant="secondary" onPress={() => void onDelete(item)} />
              </View>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.navy,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.xs
  },
  title: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800"
  },
  subtitle: {
    color: "#C7D2E2",
    fontSize: 13,
    lineHeight: 18
  },
  sectionTitle: {
    color: colors.darkSoft,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  listWrap: {
    gap: spacing.sm
  },
  itemRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.background
  },
  itemMain: {
    gap: 4
  },
  itemTitle: {
    color: colors.dark,
    fontSize: 16,
    fontWeight: "700"
  },
  itemActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  meta: {
    color: colors.slate,
    fontSize: 13,
    lineHeight: 18
  }
});
