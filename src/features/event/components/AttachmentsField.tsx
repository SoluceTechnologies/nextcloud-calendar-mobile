import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Plus, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';

import { Icon, IconButton, Item, List, SectionHeader, Stack, Typography } from '@/ui/components';
import {
  attachmentDisplayName, attachmentIcon, decodedBase64Bytes, formatBytes, MAX_ATTACHMENT_BYTES,
} from '@/features/event/utils/attachments';
import type { EventAttachment, PendingAttachment } from '@/types';

interface Props {
  /** ATTACH already on the event (edit mode), minus the ones marked removed. */
  existing: EventAttachment[];
  /** Device files buffered until save. */
  pending: PendingAttachment[];
  onAdd: (file: PendingAttachment) => void;
  onRemoveExisting: (att: EventAttachment) => void;
  onRemovePending: (index: number) => void;
}

/**
 * Form section listing existing attachments and device files queued for
 * upload. Nothing touches the network until the form is submitted.
 */
export function AttachmentsField({
  existing, pending, onAdd, onRemoveExisting, onRemovePending,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();

  async function pick() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > MAX_ATTACHMENT_BYTES) {
        Alert.alert(t('event.attachmentTooLarge'));
        return;
      }
      const contentBase64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // `asset.size` may be missing — re-check on the actual payload.
      if (decodedBase64Bytes(contentBase64) > MAX_ATTACHMENT_BYTES) {
        Alert.alert(t('event.attachmentTooLarge'));
        return;
      }
      onAdd({ name: asset.name, contentBase64, mimeType: asset.mimeType, size: asset.size });
    } catch (error) {
      console.warn('[attachments] pick/read failed', error);
      Alert.alert(t('event.attachmentAddError'));
    }
  }

  const removeButton = (onPress: () => void) => (
    <IconButton
      variant="plain"
      size={36}
      onPress={onPress}
      accessibilityLabel={t('event.attachmentRemove')}
    >
      <X size={18} color={theme.colors.textSecondary} />
    </IconButton>
  );

  return (
    <Stack gap={8}>
      <SectionHeader
        title={t('event.attachments')}
        trailing={
          <IconButton
            variant="plain"
            size={36}
            onPress={() => void pick()}
            accessibilityLabel={t('event.addAttachment')}
          >
            <Plus size={18} color={theme.colors.textSecondary} />
          </IconButton>
        }
      />
      {existing.length + pending.length > 0 && (
        <List>
          {existing.map((att, i) => {
            const AttachIcon = attachmentIcon(att);
            const subtitle = [att.fmttype, formatBytes(att.size)].filter(Boolean).join(' · ');
            return (
              <Item
                key={att.uri ?? `${att.filename ?? 'attachment'}-${i}`}
                leading={<Icon size={20}><AttachIcon color={theme.colors.textSecondary} /></Icon>}
                title={attachmentDisplayName(att)}
                description={subtitle || undefined}
                trailing={removeButton(() => onRemoveExisting(att))}
              />
            );
          })}
          {pending.map((p, i) => {
            const AttachIcon = attachmentIcon({ filename: p.name, fmttype: p.mimeType });
            const subtitle = [p.mimeType, formatBytes(p.size), t('event.attachmentPending')]
              .filter(Boolean).join(' · ');
            return (
              <Item
                key={`pending-${p.name}-${i}`}
                leading={<Icon size={20}><AttachIcon color={theme.colors.primary} /></Icon>}
                title={p.name}
                description={subtitle}
                trailing={removeButton(() => onRemovePending(i))}
              />
            );
          })}
        </List>
      )}
      {existing.length + pending.length === 0 && (
        <Typography variant="caption" color="secondary">
          {t('event.noAttachments')}
        </Typography>
      )}
    </Stack>
  );
}
