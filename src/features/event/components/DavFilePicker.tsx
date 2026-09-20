import { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { ChevronRight, Folder } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';

import {
  Icon, IconButton, Item, List, Sheet, Spinner, Typography,
} from '@/ui/components';
import {
  listDavFolder, type DavEntry, type FilesAccount,
} from '@/services/nextcloud/files';
import {
  attachmentIcon, formatBytes,
} from '@/features/event/utils/attachments';

interface Props {
  visible: boolean;
  account: FilesAccount | null;
  /** Fires with the chosen file — the sheet does not close itself. */
  onSelect: (entry: DavEntry) => void;
  onClose: () => void;
}

/**
 * Minimal Nextcloud Files browser for attaching a file that already exists on
 * the server. Navigates one folder at a time; selecting a file hands the
 * entry to the caller which writes its DAV URL into the event's ATTACH.
 */
export function DavFilePicker({ visible, account, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<DavEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (dir: string) => {
      if (!account) return;
      setEntries(null);
      setFailed(false);
      try {
        setEntries(await listDavFolder(account, dir));
      } catch (error) {
        console.warn('[attachments] DAV listing failed', dir, error);
        setFailed(true);
      }
    },
    [account],
  );

  useEffect(() => {
    if (visible) {
      setPath('');
      void load('');
    }
  }, [visible, load]);

  function open(entry: DavEntry) {
    if (entry.isDir) {
      setPath(entry.path);
      void load(entry.path);
    } else {
      onSelect(entry);
    }
  }

  const parent = path.includes('/')
    ? path.slice(0, path.lastIndexOf('/'))
    : '';

  return (
    <Sheet visible={visible} onClose={onClose} title={t('event.pickFromNextcloud')}>
      <View style={{ maxHeight: 420 }}>
        {path !== '' && (
          <Item
            leading={
              <Icon size={20}>
                <Folder color={theme.colors.textSecondary} />
              </Icon>
            }
            title={path}
            description={t('common.back')}
            onPress={() => {
              setPath(parent);
              void load(parent);
            }}
            trailing={
              <Icon size={16}>
                <ChevronRight
                  color={theme.colors.textSecondary}
                  style={{ transform: [{ rotate: '180deg' }] }}
                />
              </Icon>
            }
          />
        )}
        {entries === null && !failed && (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Spinner />
          </View>
        )}
        {failed && (
          <Typography
            variant="body2"
            color="secondary"
            style={{ padding: 16 }}
          >
            {t('event.filesLoadError')}
          </Typography>
        )}
        {entries !== null && entries.length === 0 && (
          <Typography
            variant="body2"
            color="secondary"
            style={{ padding: 16 }}
          >
            {t('event.folderEmpty')}
          </Typography>
        )}
        {entries !== null && entries.length > 0 && (
          <FlatList
            data={entries}
            keyExtractor={(e) => e.path}
            renderItem={({ item }) => {
              const RowIcon = item.isDir
                ? Folder
                : attachmentIcon({ filename: item.name, fmttype: item.mime });
              return (
                <Item
                  leading={
                    <Icon size={20}>
                      <RowIcon color={theme.colors.textSecondary} />
                    </Icon>
                  }
                  title={item.name}
                  description={
                    item.isDir
                      ? undefined
                      : [item.mime, formatBytes(item.size)]
                          .filter(Boolean)
                          .join(' · ') || undefined
                  }
                  onPress={() => open(item)}
                  trailing={
                    item.isDir ? (
                      <Icon size={16}>
                        <ChevronRight color={theme.colors.textSecondary} />
                      </Icon>
                    ) : undefined
                  }
                />
              );
            }}
          />
        )}
      </View>
    </Sheet>
  );
}
