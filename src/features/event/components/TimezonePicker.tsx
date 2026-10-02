import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Globe } from 'lucide-react-native';

import { isValidTimeZone } from '@/utils/timezone';
import { gmtOffsetLabel } from '@/utils/vtimezone';
import { Icon, Sheet, TextField, Typography } from '@/ui/components';

/**
 * Used when Intl.supportedValuesOf is unavailable (older Hermes). Covers the
 * zones most users need; the search field still applies.
 */
const FALLBACK_ZONES = [
  'UTC',
  'Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Lisbon',
  'Europe/Dublin', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen',
  'Europe/Helsinki', 'Europe/Warsaw', 'Europe/Prague', 'Europe/Vienna',
  'Europe/Budapest', 'Europe/Athens', 'Europe/Bucharest', 'Europe/Istanbul',
  'Europe/Moscow', 'Europe/Kyiv', 'Europe/Reykjavik',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Montreal', 'America/Mexico_City',
  'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Santiago',
  'America/Bogota', 'America/Lima', 'America/Anchorage', 'America/Halifax',
  'Pacific/Honolulu', 'Pacific/Auckland', 'Pacific/Fiji',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Seoul',
  'Asia/Taipei', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Kolkata', 'Asia/Dubai',
  'Asia/Jerusalem', 'Asia/Riyadh', 'Asia/Karachi',
  'Africa/Casablanca', 'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg',
  'Africa/Nairobi', 'Atlantic/Reykjavik', 'Atlantic/Azores',
];

let zonesCache: string[] | undefined;

/**
 * All IANA zones the runtime actually accepts. `supportedValuesOf` can list
 * zones the platform ICU doesn't know yet (recent tzdata renames), and Hermes
 * throws when formatting with them — so the list is filtered once, not trusted.
 */
function ianaZones(): string[] {
  if (zonesCache) return zonesCache;
  let list: string[] | undefined;
  try {
    const fn = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    const candidates = fn?.('timeZone');
    if (Array.isArray(candidates) && candidates.length > 0) list = candidates;
  } catch {
    // fall through to the bundled list
  }
  zonesCache = (list ?? FALLBACK_ZONES).filter(isValidTimeZone);
  return zonesCache;
}

interface Props {
  value: string;
  onChange: (tz: string) => void;
}

export function TimezonePicker({ value, onChange }: Props) {
  const { colors, radius } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [now] = useState(() => new Date());

  const zones = useMemo(ianaZones, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones;
    return list.includes(value) ? [value, ...list.filter((z) => z !== value)] : list;
  }, [zones, query, value]);

  return (
    <View style={styles.container}>
      <Typography variant="body2" color="secondary" style={styles.label}>
        {t('event.timezone')}
      </Typography>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('event.timezone')}
        onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: colors.surface, borderRadius: radius.md, borderColor: colors.border }]}
      >
        <Icon size={18}>
          <Globe color={colors.textSecondary} />
        </Icon>
        <Typography variant="body1" style={[styles.value, { color: colors.text }]}>
          {value.replace(/_/g, ' ')}
        </Typography>
        <Typography variant="body2" color="secondary">
          {gmtOffsetLabel(value, now)}
        </Typography>
        <ChevronDown size={18} color={colors.textTertiary} />
      </Pressable>

      {open && (
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('event.timezone')}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t('event.timezoneSearch')}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FlatList
          data={filtered}
          keyExtractor={(z) => z}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          renderItem={({ item: zone }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: zone === value }}
              style={[styles.option, { borderTopColor: colors.border }]}
              onPress={() => {
                onChange(zone);
                setOpen(false);
                setQuery('');
              }}
            >
              <View style={styles.optionBody}>
                <Typography variant="body1" color="text">
                  {zone.replace(/_/g, ' ')}
                </Typography>
                <Typography variant="caption" color="secondary">
                  {gmtOffsetLabel(zone, now)}
                </Typography>
              </View>
              {zone === value && <Check size={20} color={colors.primary} />}
            </Pressable>
          )}
        />
      </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 6 },
  label: { marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  value: { flex: 1 },
  list: { maxHeight: 420 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  optionBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
