// Browser storage stays unchanged. Android stores only ciphertext in app-private
// preferences, with the encryption key held by Android Keystore.
export function createSessionStorage({ native, bridge, browserStorage }) {
  let migration;
  const initialize = () => migration ||= (async () => {
    const { token } = await bridge.getToken();
    const legacy = browserStorage.getItem('pg_token');
    if (!token && legacy) await bridge.setToken({ token: legacy });
    // Remove the old plaintext copy only after the encrypted write succeeds.
    browserStorage.removeItem('pg_token');
  })().catch((error) => { migration = undefined; throw error; });

  return {
    async getItem(key) {
      if (!native) return browserStorage.getItem(key);
      await initialize();
      return (await bridge.getToken()).token;
    },
    async setItem(key, token) {
      if (!native) return browserStorage.setItem(key, token);
      await initialize();
      await bridge.setToken({ token });
    },
    async removeItem(key) {
      if (!native) return browserStorage.removeItem(key);
      // Wait for any migration so it cannot restore a token after logout.
      await migration?.catch(() => {});
      await bridge.clearToken();
      browserStorage.removeItem(key);
      migration = Promise.resolve();
    },
  };
}
