/**
 * downloadFile.ts — browser-native file download.
 *
 * Uses a Blob + object URL and always revokes the URL again, so a large backup
 * is not pinned in memory for the lifetime of the document.
 */

export function downloadTextFile(fileName: string, text: string, mimeType = 'application/json'): void {
    const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);

    try {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
    } finally {
        // Give the browser a tick to start the download before the URL dies.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
