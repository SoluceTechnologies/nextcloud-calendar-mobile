import { useCallback, useEffect, useState } from 'react';
import type { Account, DeletedCalendarObject } from '@/types';
import {
    deleteTrashObject,
    fetchTrashObjects,
    restoreTrashObject,
} from '@/services/nextcloud/caldav';

type State = {
    items: DeletedCalendarObject[];
    isLoading: boolean;
    unsupported: boolean;
    error: string | null;
};

export function useTrashBin(account: Account | null) {
    const [state, setState] = useState<State>({
        items: [],
        isLoading: true,
        unsupported: false,
        error: null,
    });

    const refetch = useCallback(async () => {
        if (!account) {
            setState({ items: [], isLoading: false, unsupported: false, error: null });
            return;
        }
        setState((s) => ({ ...s, isLoading: true, error: null }));
        try {
            const res = await fetchTrashObjects(account);
            const items = res.objects
                .slice()
                .sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0));
            setState({ items, isLoading: false, unsupported: !res.supported, error: null });
        } catch (e) {
            setState({ items: [], isLoading: false, unsupported: false, error: String(e) });
        }
    }, [account]);

    useEffect(() => { void refetch(); }, [refetch]);

    const restore = useCallback(async (item: DeletedCalendarObject) => {
        if (!account) return;
        await restoreTrashObject(account, item.trashHref);
        setState((s) => ({ ...s, items: s.items.filter((i) => i.trashHref !== item.trashHref) }));
    }, [account]);

    const remove = useCallback(async (item: DeletedCalendarObject) => {
        if (!account) return;
        await deleteTrashObject(account, item.trashHref);
        setState((s) => ({ ...s, items: s.items.filter((i) => i.trashHref !== item.trashHref) }));
    }, [account]);

    return { ...state, refetch, restore, remove };
}
