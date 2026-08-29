import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: register the app-shell service worker so the installed app launches
// offline. Production builds only — in dev, Vite serves everything from root
// with HMR and an SW would only get in the way. URLs are resolved against
// document.baseURI so the worker lands next to index.html at any mount path
// (GitHub Pages project site) or at root (vite preview).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', document.baseURI).href;
    const scope = new URL('./', document.baseURI).href;
    navigator.serviceWorker.register(swUrl, { scope }).catch(() => {
      // A failed registration (private mode, blocked storage) must not break the app.
    });
  });
}
