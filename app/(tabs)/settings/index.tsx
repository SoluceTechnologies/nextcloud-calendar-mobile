import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  useColorScheme,
} from "react-native";
import { styles } from "@/styles/settingsScreen";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  loadAccounts,
  deleteAccount,
  setActiveAccountId,
  clearActiveAccountId,
} from "@/api/auth";
import {
  fetchThemingCapabilities,
  updateUserPrimaryColor,
} from "@/api/nextcloud";
import { useAppStore, type ThemePreference } from "@/store/appStore";
import { useTheme, getLuminance } from "@/hooks/useTheme";
import { AccountCard } from "@/components/AccountCard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect } from "react";

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

const PRESET_COLORS = [
  { label: "Blue", value: "#0082c9" },
  { label: "Green", value: "#2ecc71" },
  { label: "Red", value: "#e74c3c" },
  { label: "Orange", value: "#f39c12" },
  { label: "Purple", value: "#9b59b6" },
  { label: "Dark Grey", value: "#34495e" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const activeAccountId = useAppStore((s) => s.activeAccountId);
  const setStoreId = useAppStore((s) => s.setActiveAccountId);
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const hourRowHeight = useAppStore((s) => s.hourRowHeight);
  const setHourRowHeight = useAppStore((s) => s.setHourRowHeight);
  const weekStartsOn = useAppStore((s) => s.weekStartsOn);
  const setWeekStartsOn = useAppStore((s) => s.setWeekStartsOn);
  const primaryColor = useAppStore((s) => s.primaryColor);
  const canChangeColor = useAppStore((s) => s.canChangeColor);
  const setTheming = useAppStore((s) => s.setTheming);
  const systemScheme = useColorScheme();

  const isThemeForced = (() => {
    if (!primaryColor) return false;
    const lum = getLuminance(primaryColor);
    const resolved =
      themePreference === "system"
        ? (systemScheme ?? "light")
        : themePreference;
    if (lum > 0.8 && resolved === "light") return true;
    if (lum < 0.1 && resolved === "dark") return true;
    return false;
  })();

  const DEFAULT_ZOOM = 60;
  const zoomLabel =
    hourRowHeight <= 45
      ? "Compact"
      : hourRowHeight <= 75
        ? "Normal"
        : hourRowHeight <= 120
          ? "Expanded"
          : "Large";

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: loadAccounts,
  });

  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  const { data: theming, isLoading: loadingTheming } = useQuery({
    queryKey: ["theming", activeAccountId],
    queryFn: () =>
      activeAccount ? fetchThemingCapabilities(activeAccount) : null,
    enabled: !!activeAccount,
  });

  useEffect(() => {
    if (theming) {
      setTheming(
        theming.color,
        theming.colorText,
        theming.userEditable,
        theming.logo,
      );
    }
  }, [theming, setTheming]);

  const colorMutation = useMutation({
    mutationFn: (color: string) => {
      if (!activeAccount) throw new Error("No active account");
      return updateUserPrimaryColor(activeAccount, color);
    },
    onSuccess: (_, color) => {
      queryClient.setQueryData(["theming", activeAccountId], (old: any) => ({
        ...old,
        color,
      }));
    },
    onError: () => {
      Alert.alert("Error", "Failed to update primary color on the server.");
    },
  });

  async function handleColorPress(color: string) {
    if (!canChangeColor) return;
    setTheming(color, theme.primaryText, true, theming?.logo || null); // Optimistic UI
    colorMutation.mutate(color);
  }

  async function handleSetActive(id: string) {
    await setActiveAccountId(id);
    setStoreId(id);
    queryClient.invalidateQueries({ queryKey: [id] });
  }

  function handleDelete(id: string, displayName: string) {
    Alert.alert("Remove Account", `Remove "${displayName}" from this device?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await deleteAccount(id);
          const remaining = accounts.filter((a) => a.id !== id);
          queryClient.setQueryData(["accounts"], remaining);
          queryClient.removeQueries({ queryKey: [id] });
          queryClient.removeQueries({ queryKey: ["avatar", id] });
          if (activeAccountId === id) {
            const next = remaining[0]?.id ?? null;
            if (next) {
              await setActiveAccountId(next);
              setStoreId(next);
            } else {
              await clearActiveAccountId();
              setStoreId(null);
              router.replace("/(auth)/setup");
              return;
            }
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView>
        <Text style={[styles.sectionHeader, { color: theme.textTertiary }]}>
          Appearance
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.cardLabel, { color: theme.text }]}>Theme</Text>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.themeChip,
                  { backgroundColor: theme.chip, borderColor: theme.border },
                  themePreference === opt.value && {
                    backgroundColor: theme.chipActive,
                    borderColor: theme.primary,
                  },
                  isThemeForced && { opacity: 0.5 },
                ]}
                onPress={() => !isThemeForced && setThemePreference(opt.value)}
                disabled={isThemeForced}
              >
                <Text
                  style={[
                    styles.themeChipText,
                    { color: theme.textSecondary },
                    themePreference === opt.value && {
                      color: theme.primaryText,
                      fontWeight: "600",
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {isThemeForced && (
            <Text style={[styles.disabledText, { color: theme.textTertiary }]}>
              Theme locked to ensure contrast with your instance color.
            </Text>
          )}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text
              style={[styles.cardLabel, { color: theme.text, marginBottom: 0 }]}
            >
              Primary Color
            </Text>
            {loadingTheming && (
              <ActivityIndicator size="small" color={theme.primary} />
            )}
          </View>

          <View style={styles.colorRow}>
            {PRESET_COLORS.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[
                  styles.colorCard,
                  {
                    backgroundColor: theme.surfaceRaised,
                    borderColor: theme.border,
                  },
                  primaryColor === c.value && {
                    borderColor: theme.primary,
                    backgroundColor: theme.surfaceRaised,
                    elevation: 5,
                  },
                  !canChangeColor && { opacity: 0.5 },
                ]}
                onPress={() => handleColorPress(c.value)}
                disabled={!canChangeColor || colorMutation.isPending}
              >
                <View
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c.value, borderColor: theme.border },
                  ]}
                />
                <Text
                  style={[
                    styles.colorName,
                    { color: theme.textSecondary },
                    primaryColor === c.value && {
                      color: theme.text,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {c.label}
                </Text>
                {primaryColor === c.value && (
                  <View style={{ position: "absolute", top: 4, right: 4 }}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={theme.primary}
                    />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
          {!canChangeColor && (
            <Text style={[styles.disabledText, { color: theme.textTertiary }]}>
              Custom theming is disabled by your Nextcloud instance.
            </Text>
          )}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.cardLabel, { color: theme.text }]}>
            Week Starts On
          </Text>
          <View style={styles.themeRow}>
            {(
              [
                { label: "Sunday", value: 0 },
                { label: "Monday", value: 1 },
              ] as const
            ).map((opt) => (
              <TouchableOpacity
                key={String(opt.value)}
                style={[
                  styles.themeChip,
                  { backgroundColor: theme.chip, borderColor: theme.border },
                  weekStartsOn === opt.value && {
                    backgroundColor: theme.chipActive,
                    borderColor: theme.primary,
                  },
                ]}
                onPress={() => setWeekStartsOn(opt.value)}
              >
                <Text
                  style={[
                    styles.themeChipText,
                    { color: theme.textSecondary },
                    weekStartsOn === opt.value && {
                      color: theme.primaryText,
                      fontWeight: "600",
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.zoomHeader}>
            <Text
              style={[styles.cardLabel, { color: theme.text, marginBottom: 0 }]}
            >
              Calendar Zoom
            </Text>
            <TouchableOpacity
              onPress={() => setHourRowHeight(DEFAULT_ZOOM)}
              disabled={hourRowHeight === DEFAULT_ZOOM}
            >
              <Text
                style={[
                  styles.resetText,
                  {
                    color:
                      hourRowHeight === DEFAULT_ZOOM
                        ? theme.textTertiary
                        : theme.primary,
                  },
                ]}
              >
                Reset
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.zoomRow}>
            <TouchableOpacity
              style={[
                styles.zoomBtn,
                { backgroundColor: theme.chip, borderColor: theme.border },
              ]}
              onPress={() => setHourRowHeight(Math.max(hourRowHeight - 15, 30))}
              disabled={hourRowHeight <= 30}
            >
              <Text
                style={[
                  styles.zoomBtnText,
                  {
                    color:
                      hourRowHeight <= 30 ? theme.textTertiary : theme.text,
                  },
                ]}
              >
                −
              </Text>
            </TouchableOpacity>
            <Text style={[styles.zoomLabel, { color: theme.textSecondary }]}>
              {zoomLabel}
            </Text>
            <TouchableOpacity
              style={[
                styles.zoomBtn,
                { backgroundColor: theme.chip, borderColor: theme.border },
              ]}
              onPress={() =>
                setHourRowHeight(Math.min(hourRowHeight + 15, 200))
              }
              disabled={hourRowHeight >= 200}
            >
              <Text
                style={[
                  styles.zoomBtnText,
                  {
                    color:
                      hourRowHeight >= 200 ? theme.textTertiary : theme.text,
                  },
                ]}
              >
                +
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: theme.textTertiary }]}>
          Accounts
        </Text>
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            isActive={account.id === activeAccountId}
            onSetActive={() => handleSetActive(account.id)}
            onDelete={() => handleDelete(account.id, account.displayName)}
          />
        ))}
        <TouchableOpacity
          style={[styles.addBtn, { borderColor: theme.primary }]}
          onPress={() => router.push("/(auth)/setup")}
        >
          <Text style={[styles.addBtnText, { color: theme.primary }]}>
            + Add Account
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
