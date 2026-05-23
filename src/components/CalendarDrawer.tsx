import {
  Animated,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { AvatarImage } from "@/components/AvatarImage";
import { useTheme } from "@/hooks/useTheme";
import { useAppStore } from "@/store/appStore";
import type { Account, CalendarMeta } from "@/types";

const DRAWER_WIDTH = 280;

interface CalendarDrawerProps {
  open: boolean;
  drawerAnim: Animated.Value;
  insets: { top: number };
  activeAccount: Account | null;
  calendars: CalendarMeta[];
  hiddenCalendarIds: string[];
  toggleCalendarVisibility: (id: string) => void;
  onClose: () => void;
  onNavigateSettings: () => void;
}

export function CalendarDrawer({
  drawerAnim,
  insets,
  activeAccount,
  calendars,
  hiddenCalendarIds,
  toggleCalendarVisibility,
  onClose,
  onNavigateSettings,
}: CalendarDrawerProps) {
  const theme = useTheme();
  const logoUrl = useAppStore((s) => s.logoUrl);

  return (
    <>
      <Pressable style={styles.overlay} onPress={onClose} />
      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX: drawerAnim }],
            backgroundColor: theme.surface,
            paddingTop: logoUrl ? 0 : insets.top,
          },
        ]}
      >
        {logoUrl && (
          <View
            style={[
              styles.logoContainer,
              {
                backgroundColor: theme.primary,
                paddingTop: insets.top,
                height: 80 + insets.top,
              },
            ]}
          >
            <Image
              source={{ uri: logoUrl }}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        )}
        <Text
          style={[
            styles.drawerSection,
            { color: theme.textTertiary, marginTop: logoUrl ? 12 : 20 },
          ]}
        >
          ACCOUNT
        </Text>

        <View style={styles.drawerAccountRow}>
          {activeAccount && <AvatarImage account={activeAccount} size={48} />}
          <View style={styles.drawerAccountText}>
            <Text
              style={[styles.drawerAccount, { color: theme.text }]}
              numberOfLines={1}
            >
              {activeAccount?.displayName ?? activeAccount?.username ?? "—"}
            </Text>
            <Text
              style={[styles.drawerAccountSub, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {activeAccount?.username}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.drawerSettingsBtn}
          onPress={onNavigateSettings}
        >
          <Text
            style={[styles.drawerSettingsBtnText, { color: theme.primary }]}
          >
            Manage accounts →
          </Text>
        </TouchableOpacity>

        <View
          style={[styles.drawerDivider, { backgroundColor: theme.border }]}
        />
        <Text style={[styles.drawerSection, { color: theme.textTertiary }]}>
          CALENDARS
        </Text>

        <ScrollView showsVerticalScrollIndicator={false}>
          {calendars.map((cal) => {
            const visible = !hiddenCalendarIds.includes(cal.id);
            return (
              <View key={cal.id} style={styles.drawerCalRow}>
                <View style={[styles.calDot, { backgroundColor: cal.color }]} />
                <Text
                  style={[styles.drawerCalName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {cal.displayName}
                </Text>
                <Switch
                  value={visible}
                  onValueChange={() => toggleCalendarVisibility(cal.id)}
                  trackColor={{ true: cal.color, false: theme.border }}
                  thumbColor="#fff"
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 10,
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    zIndex: 11,
    paddingHorizontal: 20,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 10,
  },
  drawerSection: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 6,
  },
  drawerAccount: { fontSize: 16, fontWeight: "700" },
  drawerAccountSub: { fontSize: 13, marginTop: 2 },
  drawerSettingsBtn: { marginTop: 10 },
  drawerSettingsBtnText: { fontSize: 13 },
  drawerDivider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  drawerCalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  calDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  drawerCalName: { flex: 1, fontSize: 14 },
  drawerAccountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  drawerAccountText: { flex: 1 },
  logoContainer: {
    alignItems: "center",
    marginBottom: 8,
    justifyContent: "center",
    marginHorizontal: -20,
  },
  logo: {
    width: "80%",
    height: "60%",
  },
});
