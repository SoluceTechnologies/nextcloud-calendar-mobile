import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

import { useTranslation } from 'react-i18next';
import { useTheme, useFocusEffect, useRouter } from 'expo-router';
import { Bell, X } from 'lucide-react-native';

import { useNotificationStore } from '@/stores/notificationStore';
import { List, Item, Stack, Typography, IconButton, Chip } from '@/ui/components';
import { dismissNotification } from '@/services/nextcloud/notifications';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';

export function NotificationCenter() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const account = useActiveAccount(activeAccountId);
  const allNotifications = useNotificationStore((s) => s.notifications);
  const notifications = useMemo(
    () => allNotifications.filter((n) => n.app === 'calendar' || n.app === 'event_update_notification'),
    [allNotifications],
  );
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const markAsSeen = useNotificationStore((s) => s.markAsSeen);

  useFocusEffect(
    useCallback(() => {
      notifications.forEach((n) => {
        if (!n.seen) markAsSeen(n.notificationId);
      });
    }, [notifications, markAsSeen]),
  );

  const onDismiss = async (id: number) => {
    if (!account) return;
    try {
      await dismissNotification(account, id);
      removeNotification(id);
    } catch (err) {
      console.warn('[NotificationCenter] dismiss failed:', err);
    }
  };

type NotificationType = 'created' | 'updated' | 'deleted' | 'invited' | 'response' | 'unknown';

function getNotificationType(subjectRich: string, subject: string): NotificationType {
  const rich = subjectRich.toLowerCase();
  const subj = subject.toLowerCase();
  if (rich.includes('created') || subj.includes('created')) return 'created';
  if (rich.includes('deleted') || subj.includes('deleted')) return 'deleted';
  if (rich.includes('invited') || subj.includes('invited')) return 'invited';
  if (rich.includes('accepted') || rich.includes('declined') || subj.includes('accepted') || subj.includes('declined')) return 'response';
  if (rich.includes('updated') || subj.includes('updated')) return 'updated';
  return 'unknown';
}

  if (notifications.length === 0) {
    return (
      <Stack vAlign="center" hAlign="center" padding={24} gap={12}>
        <Bell size={48} color={colors.textTertiary} />
        <Typography variant="body1" color="secondary" align="center">
          {t('notifications.empty')}
        </Typography>
      </Stack>
    );
  }

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => String(item.notificationId)}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <List>
            <Item
              onPress={() => {
                const eventParams = item.subjectRichParameters?.event as { id?: string } | undefined;
                const eventUid = eventParams?.id;
                if (eventUid) {
                  router.push(`/event/${eventUid}`);
                }
              }}
              leading={
                <View style={{ position: 'relative' }}>
                  <Bell size={20} color={item.seen ? colors.textSecondary : colors.primary} />
                  {!item.seen && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: colors.primary,
                      }}
                    />
                  )}
                </View>
              }
              title={
                <Stack gap={4}>
                  <Chip small active activeColor={colors.primary}>
                    {t(`notifications.type.${getNotificationType(item.subjectRich, item.subject)}`)}
                  </Chip>
                  <Typography variant="body1" numberOfLines={2}>
                    {item.subject}
                  </Typography>
                </Stack>
              }
              description={
                <Typography variant="caption" color="secondary" numberOfLines={2}>
                  {dayjs(item.datetime).fromNow()}
                  {item.message ? ` · ${item.message}` : ''}
                </Typography>
              }
              trailing={
                <IconButton
                  onPress={() => onDismiss(item.notificationId)}
                  size={36}
                  variant="plain"
                  round
                >
                  <X size={18} color={colors.textSecondary} />
                </IconButton>
              }
            />
          </List>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 8 },
  row: { marginBottom: 8 },
});
