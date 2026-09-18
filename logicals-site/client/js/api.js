/** Local generator access, with errors already turned into German user-facing messages. */

import { fetchGeneratorOptions, generateBooklet } from './generation/generatorClient.js';

export async function fetchOptions() {
    try {
        return await fetchGeneratorOptions();
    } catch (error) {
        throw new Error(error.message || 'Optionen konnten nicht geladen werden.');
    }
}

export async function fetchBooklet(options) {
    try {
        return await generateBooklet(options);
    } catch (error) {
        throw new Error(error.message || 'Erzeugung fehlgeschlagen.');
    }
}
