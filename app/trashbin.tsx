import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { ArchiveRestore, CheckSquare, RefreshCw, Trash2 } from 'lucide-react-native';
import {
    Button, IconButton, Item, List, ScreenHeader, SectionHeader, Spinner,
    Stack, Typography, ViewContainer,
} from '@/ui/components';
import { goBackOrHome } from '@/utils/navigationGuard';
import { useAccounts, useActiveAccount } from '@/hooks/useAccounts';
import { useCalendars } from '@/hooks/useCalendars';
import { useAccountStore } from '@/stores/accountStore';
import { useTrashBin } from '@/features/trashbin/useTrashBin';
import type { DeletedCalendarObject } from '@/types';
import { describeMutationError } from '@/services/shared/errors';
import { syncVisibleRange } from '@/database/sync';
import { monthRange } from '@/features/calendar/utils/range';

export default function TrashBinScreen() {
    const { t } = useTranslation();
    const theme = useTheme();
    const colors = theme.colors;
    const router = useRouter();
    const accounts = useAccounts();
    const activeAccountId = useAccountStore((s) => s.activeAccountId);
    const activeAccount = useActiveAccount(activeAccountId) ?? accounts[0] ?? null;
    const { data: calendars } = useCalendars(activeAccount);
    const { items, isLoading, unsupported, error, refetch, restore, remove } = useTrashBin(activeAccount);
    const [busyHref, setBusyHref] = useState<string | null>(null);

    const resync = useCallback(() => {
        if (!activeAccount || !calendars.length) return;
        const { start, end } = monthRange(new Date());
        syncVisibleRange(activeAccount, calendars, start, end).catch((e) => {
            console.warn('[trashbin] post-restore sync failed:', String(e));
        });
    }, [activeAccount, calendars]);

    const handleRestore = useCallback(async (item: DeletedCalendarObject) => {
        setBusyHref(item.trashHref);
        try {
            await restore(item);
            resync();
        } catch (e) {
            Alert.alert(t('trashbin.errorRestore'), describeMutationError(e));
        } finally {
            setBusyHref(null);
        }
    }, [restore, resync, t]);

    const handleDelete = useCallback((item: DeletedCalendarObject) => {
        Alert.alert(
            t('trashbin.confirmDeleteTitle'),
            t('trashbin.confirmDeleteMsg', { title: item.event.summary || t('trashbin.untitled') }),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('trashbin.deletePermanently'),
                    style: 'destructive',
                    onPress: async () => {
                        setBusyHref(item.trashHref);
                        try {
                            await remove(item);
                        } catch (e) {
                            Alert.alert(t('trashbin.errorDelete'), describeMutationError(e));
                        } finally {
                            setBusyHref(null);
                        }
                    },
                },
            ],
        );
    }, [remove, t]);

    return (
        <ViewContainer>
            <SafeAreaView edges={['top']} style={styles.flex}>
                <ScreenHeader
                    title={t('trashbin.title')}
                    onBack={() => goBackOrHome(router)}
                    right={(
                        <IconButton glass round size={40} onPress={() => { void refetch(); }} accessibilityLabel={t('trashbin.refresh')}>
                            <RefreshCw size={20} color={colors.text} />
                        </IconButton>
                    )}
                />
                {isLoading ? (
                    <View style={styles.center}>
                        <Spinner size="large" />
                    </View>
                ) : unsupported ? (
                    <View style={styles.center}>
                        <Typography variant="body1" color="secondary" align="center">
                            {t('trashbin.unavailable')}
                        </Typography>
                    </View>
                ) : error ? (
                    <View style={styles.center}>
                        <Typography variant="body1" color="secondary" align="center">
                            {t('trashbin.errorLoad')}
                        </Typography>
                        <Button variant="secondary" title={t('common.retry')} onPress={() => { void refetch(); }} />
                    </View>
                ) : items.length === 0 ? (
                    <View style={styles.center}>
                        <Typography variant="body1" color="secondary" align="center">
                            {t('trashbin.empty')}
                        </Typography>
                    </View>
                ) : (
                    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
                        <SectionHeader title={t('trashbin.sectionTitle')} />
                        <List>
                            {items.map((item) => (
                                <Item
                                    key={item.trashHref}
                                    leading={item.event.isTask ? <CheckSquare size={20} color={colors.textSecondary} /> : undefined}
                                    title={item.event.summary || t('trashbin.untitled')}
                                    description={item.deletedAt
                                        ? t('trashbin.deletedAtLabel', { date: dayjs(item.deletedAt).format('DD MMM YYYY HH:mm') })
                                        : dayjs(item.event.dtstart).format('DD MMM YYYY')}
                                    trailing={busyHref === item.trashHref ? (
                                        <Spinner size="small" />
                                    ) : (
                                        <View style={styles.actions}>
                                            <IconButton
                                                testID="trashbin-restore"
                                                variant="ghost"
                                                size={36}
                                                onPress={() => { void handleRestore(item); }}
                                                accessibilityLabel={t('trashbin.restore')}
                                            >
                                                <ArchiveRestore size={18} color={colors.primary} />
                                            </IconButton>
                                            <IconButton
                                                testID="trashbin-delete"
                                                variant="ghost"
                                                size={36}
                                                onPress={() => handleDelete(item)}
                                                accessibilityLabel={t('trashbin.deletePermanently')}
                                            >
                                                <Trash2 size={18} color={colors.danger} />
                                            </IconButton>
                                        </View>
                                    )}
                                />
                            ))}
                        </List>
                        <Stack padding={[16, 4]}>
                            <Typography variant="caption" color="secondary">
                                {t('trashbin.hint')}
                            </Typography>
                        </Stack>
                    </ScrollView>
                )}
            </SafeAreaView>
        </ViewContainer>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
    content: { paddingHorizontal: 16, paddingBottom: 32 },
    actions: { flexDirection: 'row', alignItems: 'center' },
});
