import {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useIsOnline} from '@/services/shared/network';
import {isVirtualLocation} from '../utils/isVirtualLocation';
import {parseLocation} from '../utils/parseLocation';
import {geocodeLocation} from '../utils/geocode';
import type {MapCoordinates} from '../types';

export type UseEventLocationResult = {
    coordinates: MapCoordinates | null;
    isVirtual: boolean;
    loading: boolean;
};

export function useEventLocation(
    location: string | undefined,
    talkUrl?: string,
): UseEventLocationResult {
    const {i18n} = useTranslation();
    const online = useIsOnline();
    const [state, setState] = useState<UseEventLocationResult>({
        coordinates: null,
        isVirtual: false,
        loading: false,
    });
    const active = useRef(true);

    useEffect(() => {
        active.current = true;
        setState({coordinates: null, isVirtual: false, loading: false});

        if (!location) {
            return () => {
                active.current = false;
            };
        }

        if (isVirtualLocation(location, talkUrl)) {
            setState({coordinates: null, isVirtual: true, loading: false});
            return () => {
                active.current = false;
            };
        }

        if (!online) {
            return () => {
                active.current = false;
            };
        }

        const direct = parseLocation(location);
        if (direct) {
            setState({coordinates: direct, isVirtual: false, loading: false});
            return () => {
                active.current = false;
            };
        }

        setState({coordinates: null, isVirtual: false, loading: true});

        geocodeLocation(location, i18n.language)
            .then((result) => {
                if (!active.current) return;
                setState({coordinates: result, isVirtual: false, loading: false});
            })
            .catch(() => {
                if (!active.current) return;
                setState({coordinates: null, isVirtual: false, loading: false});
            });

        return () => {
            active.current = false;
        };
    }, [location, talkUrl, i18n.language, online]);

    return state;
}
