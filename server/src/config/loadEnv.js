import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve from this module, so starting from the repository root still loads
// server/.env. Existing service/shell variables retain precedence.
const result = dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
export const environmentStatus = Object.freeze({
  envFileLoaded: !result.error,
  mongoUriPresent: Boolean(process.env.MONGO_URI?.trim()),
});
