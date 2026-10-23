import { useEffect, useRef, useState } from 'react';
import { api, auth, type User } from './api';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(clientId ? '' : 'VITE_GOOGLE_CLIENT_ID가 설정되지 않았습니다');

  useEffect(() => {
    if (!clientId) return;
    let timer = 0;
    const render = () => {
      if (!window.google?.accounts?.id) { timer = window.setTimeout(render, 100); return; }
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try {
            const result = await api.login(credential);
            auth.save(result.token);
            onLogin(result.user);
          } catch (e) { setError(e instanceof Error ? e.message : '로그인에 실패했습니다'); }
        },
      });
      if (buttonRef.current) window.google.accounts.id.renderButton(buttonRef.current,
        { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ko' });
    };
    render();
    return () => window.clearTimeout(timer);
  }, [onLogin]);

  return <div className="login-screen">
    <div className="login-card">
      <h1 className="login-title">SpendLog</h1>
      <p className="login-text">취미에 쓴 돈을 카테고리별로 적어 두는 가계부입니다.<br />로그인하면 어느 기기에서든 이어서 볼 수 있습니다.</p>
      {clientId && <div ref={buttonRef} className="login-button" />}
      {error && <div className="error-banner" role="alert">{error}</div>}
    </div>
  </div>;
}
