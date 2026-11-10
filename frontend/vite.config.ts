import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages(/spendlog/)와 로컬 루트 양쪽에서 파일을 찾도록 상대 경로를 씁니다.
  base: './',
  plugins: [react()],
});
