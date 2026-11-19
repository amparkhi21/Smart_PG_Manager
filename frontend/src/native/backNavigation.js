const handlers = [];
export function registerBackHandler(handler) {
  handlers.push(handler);
  return () => { const index = handlers.indexOf(handler); if (index >= 0) handlers.splice(index, 1); };
}
export function dismissTopLayer() {
  if (!handlers.length) return false;
  handlers.at(-1)();
  return true;
}
export function backAction(pathname, historyIndex = 0) {
  if (pathname === '/' || pathname === '/login') return 'minimize';
  return historyIndex > 0 ? 'back' : pathname === '/register' ? 'login' : 'home';
}
