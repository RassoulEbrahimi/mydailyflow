export interface AuthUser {
    id: string;
    email: string;
    emailConfirmedAt: string | null;
    createdAt: string;
}

export interface AccountDeletionRequest {
    email: string;
    confirmation: string;
    deviceId: string;
}

export interface AccountLifecycleController {
    user: AuthUser;
    resendConfirmation(email: string): Promise<AuthActionResult>;
    changePassword(currentPassword: string, password: string): Promise<AuthActionResult>;
    deleteAccount(request: AccountDeletionRequest): Promise<AuthActionResult>;
}

export type AuthActionResult =
    | { status: 'ok' }
    | { status: 'confirmation-required' }
    | { status: 'error'; message: string };

export interface AuthAdapter {
    getCurrentUser(): Promise<AuthUser | null>;
    onAuthStateChange(listener: (user: AuthUser | null, passwordRecovery: boolean) => void): () => void;
    signIn(email: string, password: string): Promise<AuthActionResult>;
    signUp(email: string, password: string): Promise<AuthActionResult>;
    sendPasswordReset(email: string): Promise<AuthActionResult>;
    resendConfirmation(email: string): Promise<AuthActionResult>;
    updatePassword(password: string): Promise<AuthActionResult>;
    changePassword(currentPassword: string, password: string): Promise<AuthActionResult>;
    deleteAccount(request: AccountDeletionRequest): Promise<AuthActionResult>;
    signOut(): Promise<void>;
    signOutLocal(): Promise<void>;
}
