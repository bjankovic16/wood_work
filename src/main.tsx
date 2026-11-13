import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { useDesignStore } from './store/designStore';
import { useUiStore } from './store/uiStore';

// Lets the browser test script read the state (development builds only).
if (import.meta.env.DEV) {
  Object.assign(window, { __kitchen: { design: useDesignStore, ui: useUiStore } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
