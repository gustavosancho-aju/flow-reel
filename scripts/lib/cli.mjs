import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Node resolve links simbólicos; argv pode conservar /var ou uma junction. */
export function executadoDiretamente(url, argv = process.argv) {
  if (!argv[1]) return false;
  try { return realpathSync(fileURLToPath(url)) === realpathSync(resolve(argv[1])); }
  catch { return false; }
}
