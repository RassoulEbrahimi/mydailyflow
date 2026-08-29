import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LogIn, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import type { AuthUser } from '../auth/types';
import { singleDeviceSessionTransportFor } from '../auth/singleDeviceSession';
import type { RealAuthConfig } from '../config/features';
import { loadOrCreateDeviceId } from '../sync/clientState';

type GateState = 'checking' | 'active' | 'displaced' | 'offline' | 'error';

export interface SingleDeviceStatus {
    deviceId: string;
    lastVerifiedAt: string;
}

const SingleDeviceStatusContext = createContext<SingleDeviceStatus | null>(null);

export const useSingleDeviceStatus = (): SingleDeviceStatus | null =>
    useContext(SingleDeviceStatusContext);

interface SingleDeviceGateProps {
    config: RealAuthConfig;
    user: AuthUser;
    allowTakeover: boolean;
    signOutLocal(): Promise<void>;
    children: ReactNode;
}

const statusPage = (icon: ReactNode, title: string, copy: string, action?: ReactNode) => (
    <div className="min-h-screen bg-page px-5 font-display flex items-center justify-center">
        <div className="w-full max-w-sm rounded-[2rem] border border-edge bg-surface-overlay p-7 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised text-primary-text">
                {icon}
            </div>
            <h1 className="text-xl font-bold text-fg">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-fg-secondary">{copy}</p>
            {action}
        </div>
    </div>
);

export default function SingleDeviceGate({
    config,
    user,
    allowTakeover,
    signOutLocal,
    children,
}: SingleDeviceGateProps) {
    const transport = useMemo(
        () => singleDeviceSessionTransportFor(config),
        [config.url, config.publishableKey],
    );
    const deviceId = useMemo(() => loadOrCreateDeviceId(localStorage), [user.id]);
    const [state, setState] = useState<GateState>('checking');
    const [lastVerifiedAt, setLastVerifiedAt] = useState('');

    const check = useCallback(async (activate: boolean) => {
        if (!navigator.onLine) {
            setState('offline');
            return;
        }
        try {
            const result = activate
                ? await transport.activate(deviceId, allowTakeover)
                : await transport.verify(deviceId);
            if (result.status === 'active') {
                setLastVerifiedAt(new Date().toISOString());
                setState('active');
            } else {
                setState('displaced');
            }
        } catch (error) {
            console.error('Single-device session check failed', error instanceof Error ? error.message : 'unknown error');
            setState(navigator.onLine ? 'error' : 'offline');
        }
    }, [allowTakeover, deviceId, transport]);

    useEffect(() => {
        let active = true;
        const run = async (activate: boolean) => {
            if (!active) return;
            await check(activate);
        };
        void run(true);

        const online = () => void run(false);
        const offline = () => setState('offline');
        const visible = () => {
            if (document.visibilityState === 'visible') void run(false);
        };
        const focused = () => void run(false);
        const interval = window.setInterval(() => void run(false), 5_000);
        window.addEventListener('online', online);
        window.addEventListener('offline', offline);
        window.addEventListener('focus', focused);
        document.addEventListener('visibilitychange', visible);
        return () => {
            active = false;
            window.clearInterval(interval);
            window.removeEventListener('online', online);
            window.removeEventListener('offline', offline);
            window.removeEventListener('focus', focused);
            document.removeEventListener('visibilitychange', visible);
        };
    }, [check]);

    if (state === 'active') {
        return (
            <SingleDeviceStatusContext.Provider value={{ deviceId, lastVerifiedAt }}>
                {children}
            </SingleDeviceStatusContext.Provider>
        );
    }
    if (state === 'checking') {
        return statusPage(
            <RefreshCw size={28} className="animate-spin" aria-hidden="true" />,
            'Gerät wird geprüft',
            'My Daily Flow stellt sicher, dass dein Konto nur auf diesem Gerät aktiv ist.',
        );
    }
    if (state === 'displaced') {
        return statusPage(
            <ShieldAlert size={30} aria-hidden="true" />,
            'Konto auf einem anderen Gerät aktiv',
            'Dieses Gerät wurde sicher gesperrt. Melde dich erneut an, wenn du die Nutzung auf dieses Gerät zurückholen möchtest.',
            <button
                type="button"
                onClick={() => void signOutLocal()}
                className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1.5rem] bg-primary px-4 font-semibold text-white"
            >
                <LogIn size={20} aria-hidden="true" />
                Erneut anmelden
            </button>,
        );
    }
    if (state === 'offline') {
        return statusPage(
            <WifiOff size={30} aria-hidden="true" />,
            'Internetverbindung erforderlich',
            'Zum Schutz vor gleichzeitiger Nutzung auf mehreren Geräten bleibt die App offline gesperrt. Deine lokalen Daten werden nicht gelöscht.',
            <button
                type="button"
                onClick={() => void check(false)}
                className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1.5rem] bg-primary px-4 font-semibold text-white"
            >
                <RefreshCw size={20} aria-hidden="true" />
                Erneut prüfen
            </button>,
        );
    }
    return statusPage(
        <ShieldAlert size={30} aria-hidden="true" />,
        'Sitzung konnte nicht geprüft werden',
        'Die App bleibt vorsorglich gesperrt. Prüfe deine Verbindung und versuche es erneut.',
        <button
            type="button"
            onClick={() => { setState('checking'); void check(false); }}
            className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1.5rem] bg-primary px-4 font-semibold text-white"
        >
            <RefreshCw size={20} aria-hidden="true" />
            Erneut prüfen
        </button>,
    );
}
