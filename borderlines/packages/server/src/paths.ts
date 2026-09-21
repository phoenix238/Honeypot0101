import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * `src/` and `dist/` sit at the same depth under packages/server, so one path
 * works for both `tsx` and the compiled build.
 */
export const REPO_DATA_DIR = process.env.BORDERLINES_DATA_DIR ?? resolve(here, '../../../data');
export const SNAPSHOT_PATH = resolve(REPO_DATA_DIR, 'snapshot.json');
export const WEB_DIST_DIR = resolve(here, '../../web/dist');
