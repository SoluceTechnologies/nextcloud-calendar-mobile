import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { Check, CircleHelp, X, CircleDashed } from 'lucide-react-native';
import { Chip } from '@/ui/components';

interface Props {
  partstat?: string;
}

const ICON_SIZE = 14;

/** RSVP status chip shown next to an attendee (Penpot #256 option A). */
export function PartstatChip({ partstat }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = (partstat ?? 'NEEDS-ACTION').toUpperCase();

  const config: Record<string, { key: string; color: string; icon: React.ReactNode }> = {
    ACCEPTED: {
      key: 'event.rsvpAccepted',
      color: colors.success,
      icon: <Check size={ICON_SIZE} color="#fff" />,
    },
    TENTATIVE: {
      key: 'event.rsvpTentative',
      color: colors.warning,
      icon: <CircleHelp size={ICON_SIZE} color="#fff" />,
    },
    DECLINED: {
      key: 'event.rsvpDeclined',
      color: colors.danger,
      icon: <X size={ICON_SIZE} color="#fff" />,
    },
  };
  const entry = config[status] ?? {
    key: 'event.rsvpNoResponse',
    color: colors.textTertiary,
    icon: <CircleDashed size={ICON_SIZE} color="#fff" />,
  };

  return (
    <Chip small active activeColor={entry.color} icon={entry.icon} testID={`partstat-${status.toLowerCase()}`}>
      {t(entry.key)}
    </Chip>
  );
}
