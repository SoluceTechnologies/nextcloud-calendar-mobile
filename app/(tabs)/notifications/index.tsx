import { useTranslation } from 'react-i18next';
import { ViewContainer, ScreenHeader } from '@/ui/components';
import { NotificationCenter } from '@/features/notifications/NotificationCenter';

export default function NotificationsScreen() {
  const { t } = useTranslation();

  return (
    <ViewContainer>
      <ScreenHeader title={t('notifications.title')} />
      <NotificationCenter />
    </ViewContainer>
  );
}
