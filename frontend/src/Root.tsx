import { useCallback, useEffect, useState } from 'react';
import { api, auth, type User } from './api';
import App from './App';
import Login from './Login';

export default function Root() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(() => auth.token() !== null);

  useEffect(() => {
    auth.onUnauthorized(() => setUser(null));
    if (!auth.token()) return;
    api.me().then(setUser).catch(() => auth.clear()).finally(() => setChecking(false));
  }, []);

  const logout = useCallback(() => {
    auth.clear();
    window.google?.accounts?.id.disableAutoSelect();
    setUser(null);
  }, []);

  if (checking) return null;
  return user ? <App user={user} onLogout={logout} /> : <Login onLogin={setUser} />;
}
