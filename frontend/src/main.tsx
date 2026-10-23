import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from './Root';
import './styles.css';

// 로그인 화면에서도 테마 색이 적용되도록 앱보다 먼저 지정합니다.
try { document.body.dataset.theme = localStorage.getItem('spendlog_theme') === 'dark' ? 'dark' : 'light'; }
catch { document.body.dataset.theme = 'light'; }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Root /></React.StrictMode>,
);
