const names = new Set([
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'MongoParseError',
  'MongoInvalidArgumentError', 'MongoServerError', 'MongoNetworkError',
  'MongoNetworkTimeoutError', 'MongoServerSelectionError', 'MongooseServerSelectionError',
]);
const codes = new Set([
  'ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ETIMEOUT', 'EREFUSED', 'ECONNREFUSED',
  'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN',
  'EADDRINUSE', 'EACCES', 'ERR_MODULE_NOT_FOUND', 'ERR_INVALID_URL',
  'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR', 'ERR_SSL_CERTIFICATE_VERIFY_FAILED',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);
const syscalls = new Set(['querySrv', 'queryTxt', 'getaddrinfo', 'connect', 'listen']);

export function startupErrorDetails(error) {
  const seen = new Set(), pending = [error], errors = [];
  while (pending.length) {
    const item = pending.shift();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item); errors.push(item);
    pending.push(item.cause, item.reason, item.error);
    if (item.servers instanceof Map) pending.push(...item.servers.values());
  }

  // Driver messages, stacks, server addresses and arbitrary properties can
  // contain credentials. Emit only recognized identifiers and fixed guidance.
  const identifiers = [...new Set(errors.flatMap((item) => [
    names.has(item.name) ? item.name : null,
    codes.has(item.code) || [13, 18, 8000].includes(item.code) ? item.code : null,
    syscalls.has(item.syscall) ? item.syscall : null,
  ]).filter((value) => value !== null))];
  const hasCode = (...values) => errors.some((item) => values.includes(item.code));
  const matches = (pattern) => errors.some((item) => typeof item.message === 'string' && pattern.test(item.message));
  let reason;
  if (hasCode('EADDRINUSE')) reason = 'The configured PORT is already in use.';
  else if (hasCode(18, 8000) || matches(/authentication failed|bad auth|auth failed|scram/i)) {
    reason = 'MongoDB authentication failed. Check the Atlas database user, password encoding and authSource.';
  } else if (hasCode(13)) reason = 'MongoDB denied access to the configured database. Check the database user roles.';
  else if (errors.some((item) => ['querySrv', 'queryTxt', 'getaddrinfo'].includes(item.syscall))
      || hasCode('ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ETIMEOUT', 'EREFUSED', 'EAI_AGAIN')) {
    reason = 'MongoDB DNS lookup failed. Check the configured Atlas hostname and whether this network permits SRV/TXT DNS queries.';
  } else if (matches(/tls|ssl|certificate/i)) {
    reason = 'MongoDB TLS negotiation failed. Check the system clock, certificate trust and network TLS inspection.';
  } else if (hasCode('ECONNREFUSED')) reason = 'The MongoDB TCP connection was refused. Check the database endpoint and firewall.';
  else if (hasCode('ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH') || matches(/timed out|could not connect to any servers/i)) {
    reason = 'MongoDB servers are unreachable. Check outbound connectivity, Atlas cluster status and the Atlas IP access list.';
  } else if (errors.some((item) => ['MongoParseError', 'MongoInvalidArgumentError'].includes(item.name))) {
    reason = 'MongoDB connection-string parsing failed. Check MONGO_URI syntax and percent-encode credential characters.';
  } else reason = 'Startup failed; inspect the reported error identifiers for the failing stage.';
  return `${identifiers.join(' / ') || 'Error'}: ${reason}`;
}
