/** Worker thread entry point: keeps puzzle generation off the HTTP event loop. */
import { parentPort, workerData } from 'worker_threads';

import { generateGermanLogicBooklet, GermanBookletOptions } from '../src';

if (!parentPort) {
    throw new Error('bookletWorker must be started as a worker thread.');
}

parentPort.postMessage(generateGermanLogicBooklet(workerData as GermanBookletOptions));
