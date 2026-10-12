import {writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verificationAssets} from '../windows/verification.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const assets=await verificationAssets(root);
for(const name of ['extension.js','controls.js'])await writeFile(join(root,'extension',name),assets.get(name));
console.log('Direct-file verification assets generated.');
