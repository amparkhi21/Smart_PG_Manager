export const sessionHome = ({ owner, resident }) => owner ? '/' : resident?.passwordChangeRequired
  ? '/resident/change-password' : resident ? '/resident/dashboard' : '/';

export function ownerReturnPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
    && !/^\/(resident(?:\/|$)|owner(?:\/|$)|login$|register$)/.test(path) ? path : '/';
}
