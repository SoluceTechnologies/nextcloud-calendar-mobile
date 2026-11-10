import { useAttendeePhoto } from '@/features/event/hooks/useAttendeePhoto';
import { useContactAvatar } from '@/features/event/hooks/useContactAvatar';
import { Avatar } from '@/ui/components';
import type { Account } from '@/types';

interface Props {
  account: Pick<Account, 'id' | 'baseUrl' | 'username' | 'appPassword'> | null;
  email?: string;
  displayName?: string;
  size: number;
}

/** Avatar for an event attendee/organizer: resolves the photo through the
 * sharees autocompletion (email → photoUrl), falls back to initials. */
export function AttendeeAvatar({ account, email, displayName, size }: Props) {
  const { photoUrl } = useAttendeePhoto(account, email);
  const { data: avatarUri } = useContactAvatar(account, photoUrl);
  return <Avatar uri={avatarUri} name={displayName ?? email} size={size} />;
}
