import jwt from 'jsonwebtoken';

const isLocalHost = (hostname) => /^(localhost|127\..*|\[::1\]|0\.0\.0\.0)$|\.localhost$/i.test(hostname);
const isPlaceholder = (value) => /<[^>]+>|replace[_-]?me|change[_-]?me|your[_-]|example/i.test(value);

export function clientOrigins(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const value = env.CLIENT_URL || (production ? '' : 'http://localhost:5173');
  if (!value.trim()) throw new Error('CLIENT_URL is required in production');
  return [...new Set(value.split(',').map((entry) => {
    try {
      const url = new URL(entry.trim());
      // Capacitor Android is allowed only when this exact origin is configured.
      const isCapacitorAndroidOrigin = url.origin === 'https://localhost';
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*') ||
          (production && (url.protocol !== 'https:' ||
            (isLocalHost(url.hostname) && !isCapacitorAndroidOrigin)))) throw new Error();
      return url.origin;
    } catch {
      throw new Error('CLIENT_URL must contain exact frontend origins (HTTPS in production), separated by commas');
    }
  }))];
}

export function validateEnv(env = process.env) {
  if (env.NODE_ENV && !['development', 'test', 'production'].includes(env.NODE_ENV)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  if (!env.MONGO_URI || !/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI) || isPlaceholder(env.MONGO_URI)) {
    throw new Error('MONGO_URI must be a configured MongoDB connection string');
  }
  if (env.NODE_ENV === 'production' && /(?:\/\/|@)(?:localhost|127\.[\d.]+|\[::1\]|0\.0\.0\.0)(?=[:/,?]|$)/i.test(env.MONGO_URI)) {
    throw new Error('MONGO_URI must use a cloud database in production');
  }
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || isPlaceholder(env.JWT_SECRET)) {
    throw new Error('JWT_SECRET must be a unique random secret of at least 32 characters, not a placeholder');
  }
  try {
    const token = jwt.sign({ id: 'configuration-check' }, env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN || '7d',
    });
    const { exp, iat } = jwt.decode(token);
    if (exp <= iat) throw new Error();
  } catch {
    throw new Error('JWT_EXPIRES_IN must be a positive duration such as 7d or 12h');
  }
  clientOrigins(env);
  return { port };
}
