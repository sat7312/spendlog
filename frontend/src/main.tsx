import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// 첫 화면부터 테마 색이 적용되도록 앱보다 먼저 지정합니다.
try { document.body.dataset.theme = localStorage.getItem('spendlog_theme') === 'dark' ? 'dark' : 'light'; }
catch { document.body.dataset.theme = 'light'; }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
