import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, auth, type User } from './api';
import App from './App';
import Login from './Login';

export default function Root() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(() => auth.token() !== null);
  const [failure, setFailure] = useState('');
  const inFlight = useRef(false);

  // 401은 공통 처리에서 토큰을 지우므로 로그인 화면으로 갑니다.
  // 네트워크 오류나 서버 오류는 토큰을 남겨 두고 다시 시도할 수 있게 합니다.
  const check = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    api.me()
      .then(next => { setUser(next); setFailure(''); })
      .catch(e => {
        if (e instanceof ApiError && e.status === 401) { setFailure(''); return; }
        setFailure(e instanceof Error ? e.message : '요청에 실패했습니다');
      })
      .finally(() => { inFlight.current = false; setChecking(false); });
  }, []);

  useEffect(() => {
    auth.onUnauthorized(() => setUser(null));
    if (auth.token()) check();
  }, [check]);

  const logout = useCallback(() => {
    auth.clear();
    window.google?.accounts?.id.disableAutoSelect();
    setUser(null);
  }, []);

  if (failure) return <div className="login-screen">
    <div className="login-card">
      <h1 className="login-title">SpendLog</h1>
      <p className="login-text">로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      <div className="error-banner" role="alert">{failure}</div>
      <button className="btn btn-primary" onClick={check} disabled={checking}>다시 시도</button>
    </div>
  </div>;
  if (checking) return null;
  return user ? <App user={user} onLogout={logout} /> : <Login onLogin={setUser} />;
}
