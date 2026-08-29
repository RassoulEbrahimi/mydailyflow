export const ACCOUNT_DELETE_PHRASE = 'KONTO LÖSCHEN';
export const ACCOUNT_PASSWORD_MIN_LENGTH = 12;

export function passwordChangeError(
    currentPassword: string,
    password: string,
    confirmation: string,
): string | null {
    if (!currentPassword) return 'Gib zuerst dein aktuelles Passwort ein.';
    if (password.length < ACCOUNT_PASSWORD_MIN_LENGTH) {
        return `Das neue Passwort muss mindestens ${ACCOUNT_PASSWORD_MIN_LENGTH} Zeichen lang sein.`;
    }
    if (password === currentPassword) return 'Das neue Passwort muss sich vom aktuellen unterscheiden.';
    if (password !== confirmation) return 'Die neuen Passwörter stimmen nicht überein.';
    return null;
}

export function accountDeletionError(input: {
    accountEmail: string;
    typedEmail: string;
    typedPhrase: string;
    backupMatches: boolean;
}): string | null {
    if (!input.backupMatches) return 'Erstelle zuerst ein aktuelles Backup und ändere danach keine Daten mehr.';
    if (input.typedEmail.trim().toLocaleLowerCase('de-DE') !== input.accountEmail.toLocaleLowerCase('de-DE')) {
        return 'Die eingegebene E-Mail-Adresse stimmt nicht mit dem Konto überein.';
    }
    if (input.typedPhrase !== ACCOUNT_DELETE_PHRASE) {
        return `Gib zur Bestätigung exakt „${ACCOUNT_DELETE_PHRASE}“ ein.`;
    }
    return null;
}
