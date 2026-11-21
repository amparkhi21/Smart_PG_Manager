import { getErrorMessage } from './format.js';

export const COMMUNITY_MESSAGE_LIMIT = 2000;
export const COMMUNITY_POLL_MS = 15000;

export const compareMessages = (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);

export function mergeMessages(current, incoming, pgId) {
  const messages = new Map();
  for (const message of [...current, ...incoming]) {
    if (message.pgId === pgId) messages.set(message.id, message);
  }
  return [...messages.values()].sort(compareMessages);
}

// Refresh only the range covered by the server response; keep loaded older history.
export function reconcileMessages(current, incoming, pgId, hasMore, mutated = false) {
  const oldest = incoming.at(-1);
  const retained = mutated ? current : hasMore && oldest ? current.filter((message) => compareMessages(message, oldest) < 0) : [];
  return mergeMessages(retained, incoming, pgId);
}

export const isOwnMessage = (message, userId, role) => message.sender.id === userId && message.sender.role === role;

export function messageError(text) {
  if (!text.trim()) return 'Write a message before sending.';
  return text.trim().length > COMMUNITY_MESSAGE_LIMIT ? `Keep your message within ${COMMUNITY_MESSAGE_LIMIT} characters.` : '';
}

export function communityError(error) {
  if (error.communityScope) return 'Could not verify your PG community. Reload this page to continue.';
  if (error.response?.status === 429) {
    const seconds = Number(error.response.headers?.['retry-after']);
    return seconds > 0 ? `You are sending messages too quickly. Please wait ${Math.ceil(seconds)} seconds before trying again.` : 'You are sending messages too quickly. Please wait a minute before trying again.';
  }
  return getErrorMessage(error);
}
