import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing } from "../constants/theme";

type DrawerItem = {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: DrawerItem[];
  title?: string;
  subtitle?: string;
};

const DRAWER_WIDTH = 312;

export function MobileDrawer({ open, onClose, items, title = "ZimTILL", subtitle = "More pages" }: Props) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: open ? 0 : -DRAWER_WIDTH,
      duration: 180,
      useNativeDriver: true
    }).start();
  }, [open, translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 12,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < 0) {
            translateX.setValue(Math.max(-DRAWER_WIDTH, gestureState.dx));
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -48) {
            onClose();
            return;
          }

          Animated.timing(translateX, {
            toValue: 0,
            duration: 120,
            useNativeDriver: true
          }).start();
        }
      }),
    [onClose, translateX]
  );

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={open}>
      <View style={styles.overlayWrap}>
        <Animated.View
          style={[
            styles.drawer,
            {
              paddingTop: insets.top,
              paddingBottom: insets.bottom + spacing.md,
              transform: [{ translateX }]
            }
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.header}>
            <Text style={styles.kicker}>Menu</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.body}>
            {items.map((item) => (
              <Pressable key={item.key} onPress={item.onPress} style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
                <View style={styles.iconWrap}>
                  <Text style={styles.iconText}>{item.icon}</Text>
                </View>
                <Text style={styles.itemLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
        <Pressable style={styles.overlay} onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayWrap: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.28)",
    flexDirection: "row"
  },
  overlay: {
    flex: 1
  },
  drawer: {
    width: DRAWER_WIDTH,
    maxWidth: "86%",
    backgroundColor: colors.background,
    shadowColor: "#000000",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 18
  },
  header: {
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: 4
  },
  kicker: {
    color: "#C7D2E2",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800"
  },
  subtitle: {
    color: "#D7E2F0",
    fontSize: 13
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background
  },
  itemPressed: {
    backgroundColor: colors.surface
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(11, 31, 59, 0.08)",
    alignItems: "center",
    justifyContent: "center"
  },
  iconText: {
    color: colors.navy,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4
  },
  itemLabel: {
    color: colors.dark,
    fontSize: 15,
    fontWeight: "700"
  }
});
