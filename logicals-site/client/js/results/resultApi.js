export async function submitResult(submission) {
    let response;
    try {
        response = await fetch('/api/results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submission),
        });
    } catch {
        throw new Error('Ergebnis konnte gerade nicht gespeichert werden.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Ergebnis konnte nicht gespeichert werden.');
    return data.result;
}
