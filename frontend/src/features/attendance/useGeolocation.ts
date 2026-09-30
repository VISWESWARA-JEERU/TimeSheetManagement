import { useCallback, useState } from 'react';
import type { LocationBody } from './api';

export type BrowserPermission = 'granted' | 'denied' | 'unavailable';

export interface GeoFix {
    latitude: number;
    longitude: number;
    accuracy_m: number;
}

export interface GeoResult {
    fix: GeoFix | null;
    permission: BrowserPermission;
    error: string | null;
}

interface State {
    permission: BrowserPermission | 'unknown';
    fix: GeoFix | null;
    error: string | null;
    loading: boolean;
}

const initial: State = { permission: 'unknown', fix: null, error: null, loading: false };

const DEVICE_KEY = 'timesheet_device_id';

export function getDeviceId(): string {
    if (typeof window === 'undefined') return 'server';
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(DEVICE_KEY, id);
    return id;
}

export function unavailableLocationBody(
    permission: BrowserPermission = 'unavailable',
): LocationBody {
    return {
        latitude: null,
        longitude: null,
        accuracy_m: null,
        geo_permission: permission,
        client_reported_at: new Date().toISOString(),
        device_id: getDeviceId(),
    };
}

export function requestBrowserLocation(): Promise<GeoResult> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        return Promise.resolve({
            fix: null,
            permission: 'unavailable',
            error: 'Geolocation is not supported by this browser.',
        });
    }

    return new Promise<GeoResult>((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    fix: {
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy_m: pos.coords.accuracy,
                    },
                    permission: 'granted',
                    error: null,
                });
            },
            (err) => {
                resolve({
                    fix: null,
                    permission: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
                    error: err.message || 'Unable to determine location.',
                });
            },
            { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
        );
    });
}

export function geoResultToLocationBody(result: GeoResult): LocationBody {
    return {
        latitude: result.fix?.latitude ?? null,
        longitude: result.fix?.longitude ?? null,
        accuracy_m: result.fix?.accuracy_m ?? null,
        geo_permission: result.permission,
        client_reported_at: new Date().toISOString(),
        device_id: getDeviceId(),
    };
}

/**
 * One-shot geolocation. Never watches or continuously tracks the user.
 * The same helper is reused at sign-in and sign-out so attendance events
 * consistently carry location permission and a stable browser device id.
 */
export function useGeolocation() {
    const [state, setState] = useState<State>(initial);

    const request = useCallback(async (): Promise<GeoResult> => {
        setState((s) => ({ ...s, loading: true, error: null }));
        const result = await requestBrowserLocation();
        setState({
            permission: result.permission,
            fix: result.fix,
            error: result.error,
            loading: false,
        });
        return result;
    }, []);

    const reset = useCallback(() => setState(initial), []);

    return { ...state, request, reset };
}
