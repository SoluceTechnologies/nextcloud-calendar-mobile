import { useContactAvatar } from '@/features/event/hooks/useContactAvatar';
import { Avatar } from '@/ui/components';
import type { ShareeResult } from '@/services/nextcloud/sharees';
import type { Account } from '@/types';

interface Props {
  account: Pick<Account, 'id' | 'baseUrl' | 'username' | 'appPassword'> | null;
  contact: Pick<ShareeResult, 'displayName' | 'photoUrl'>;
  size: number;
}

export function ContactAvatar({ account, contact, size }: Props) {
  const { data: avatarUri } = useContactAvatar(account, contact.photoUrl);
  return <Avatar uri={avatarUri} name={contact.displayName} size={size} />;
}
