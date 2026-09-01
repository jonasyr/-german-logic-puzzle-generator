import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { generateGermanLogicBooklet } from '../src';

const output = resolve(process.argv[2] ?? 'tmp/pdfs/german-logicals.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(generateGermanLogicBooklet(), null, 2)}\n`, 'utf8');
console.log(output);
