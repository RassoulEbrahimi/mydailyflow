import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { RealAuthConfig } from '../config/features';
import { useRealAuth } from '../hooks/useRealAuth';
import FirstSignInReconciliation from './FirstSignInReconciliation';
import RealLoginPage from './RealLoginPage';
import PasswordRecoveryPage from './PasswordRecoveryPage';
import SingleDeviceGate from './SingleDeviceGate';
import { hasEstablishedSyncClient } from '../sync/clientState';
import type { AccountLifecycleController, AuthActionResult } from '../auth/types';

interface RealAuthRootProps {
    config: RealAuthConfig;
    renderApp(props: {
        logout: () => void;
        accountLabel: string;
        userId: string;
        accountLifecycle?: AccountLifecycleController;
    }): ReactNode;
}

export default function RealAuthRoot({ config, renderApp }: RealAuthRootProps) {
    const auth = useRealAuth(config);
    const [continueLocal, setContinueLocal] = useState(false);
    const [allowTakeover, setAllowTakeover] = useState(false);

    useEffect(() => {
        if (auth.status !== 'signed-in') {
            setContinueLocal(false);
            if (auth.status === 'signed-out') setAllowTakeover(false);
        }
    }, [auth.status]);

    const signIn = async (email: string, password: string): Promise<AuthActionResult> => {
        setAllowTakeover(true);
        const result = await auth.signIn(email, password);
        if (result.status !== 'ok') setAllowTakeover(false);
        return result;
    };

    const signUp = async (email: string, password: string): Promise<AuthActionResult> => {
        setAllowTakeover(true);
        const result = await auth.signUp(email, password);
        if (result.status !== 'ok') setAllowTakeover(false);
        return result;
    };

    if (auth.status === 'loading') {
        return <div role="status" className="min-h-screen bg-page flex items-center justify-center text-fg-secondary">Sichere Sitzung wird geprüft…</div>;
    }
    if (!auth.user) {
        return <RealLoginPage syncEnabled={config.syncEnabled} onSignIn={signIn} onSignUp={signUp} onReset={auth.sendPasswordReset} />;
    }
    if (auth.status === 'password-recovery') {
        return <PasswordRecoveryPage onUpdate={auth.updatePassword} onLogout={() => void auth.signOut()} />;
    }
    const establishedSyncClient = config.syncEnabled
        && hasEstablishedSyncClient(localStorage, auth.user.id);
    let content: ReactNode;
    if (!continueLocal && !establishedSyncClient) {
        content = (
            <FirstSignInReconciliation
                config={config}
                user={auth.user}
                onContinueLocal={() => setContinueLocal(true)}
                onLogout={() => void auth.signOut()}
            />
        );
    } else {
        content = renderApp({
            logout: () => void auth.signOut(),
            accountLabel: auth.user.email,
            userId: auth.user.id,
            accountLifecycle: config.accountLifecycleEnabled ? {
                user: auth.user,
                resendConfirmation: auth.resendConfirmation,
                changePassword: auth.changePassword,
                deleteAccount: auth.deleteAccount,
            } : undefined,
        });
    }
    return (
        <SingleDeviceGate
            config={config}
            user={auth.user}
            allowTakeover={allowTakeover}
            signOutLocal={auth.signOutLocal}
        >
            {content}
        </SingleDeviceGate>
    );
}
