/** All /api access, with errors already turned into German user-facing messages. */

async function readError(response, fallback) {
    const data = await response.json().catch(() => ({}));
    return new Error(data.error || fallback);
}

export async function fetchOptions() {
    let response;
    try {
        response = await fetch('/api/options');
    } catch {
        throw new Error('Keine Verbindung zum Server.');
    }
    if (!response.ok) throw new Error('Optionen konnten nicht geladen werden.');
    return response.json();
}

export async function fetchBooklet(options) {
    let response;
    try {
        response = await fetch('/api/booklet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options),
        });
    } catch {
        throw new Error('Keine Verbindung zum Server.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Erzeugung fehlgeschlagen.');
    return data;
}

export async function fetchPdf(options) {
    let response;
    try {
        response = await fetch('/api/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options),
        });
    } catch {
        throw new Error('Keine Verbindung zum Server.');
    }
    if (!response.ok) throw await readError(response, 'PDF-Erzeugung fehlgeschlagen.');

    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    return { blob: await response.blob(), filename: match ? match[1] : 'logicals.pdf' };
}
