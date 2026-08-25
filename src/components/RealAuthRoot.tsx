import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { RealAuthConfig } from '../config/features';
import { useRealAuth } from '../hooks/useRealAuth';
import FirstSignInReconciliation from './FirstSignInReconciliation';
import RealLoginPage from './RealLoginPage';
import PasswordRecoveryPage from './PasswordRecoveryPage';
import { hasEstablishedSyncClient } from '../sync/clientState';

interface RealAuthRootProps {
    config: RealAuthConfig;
    renderApp(props: { logout: () => void; accountLabel: string; userId: string }): ReactNode;
}

export default function RealAuthRoot({ config, renderApp }: RealAuthRootProps) {
    const auth = useRealAuth(config);
    const [continueLocal, setContinueLocal] = useState(false);

    useEffect(() => {
        if (auth.status !== 'signed-in') setContinueLocal(false);
    }, [auth.status]);

    if (auth.status === 'loading') {
        return <div role="status" className="min-h-screen bg-page flex items-center justify-center text-fg-secondary">Sichere Sitzung wird geprüft…</div>;
    }
    if (!auth.user) {
        return <RealLoginPage syncEnabled={config.syncEnabled} onSignIn={auth.signIn} onSignUp={auth.signUp} onReset={auth.sendPasswordReset} />;
    }
    if (auth.status === 'password-recovery') {
        return <PasswordRecoveryPage onUpdate={auth.updatePassword} onLogout={() => void auth.signOut()} />;
    }
    const establishedSyncClient = config.syncEnabled
        && hasEstablishedSyncClient(localStorage, auth.user.id);
    if (!continueLocal && !establishedSyncClient) {
        return (
            <FirstSignInReconciliation
                config={config}
                user={auth.user}
                onContinueLocal={() => setContinueLocal(true)}
                onLogout={() => void auth.signOut()}
            />
        );
    }
    return <>{renderApp({ logout: () => void auth.signOut(), accountLabel: auth.user.email, userId: auth.user.id })}</>;
}
