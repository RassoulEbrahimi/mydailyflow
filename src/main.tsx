import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { migrateStorageToV2 } from './utils/phase2Migration';
import { registerBlockedSlice } from './utils/storageHealth';

const migration = migrateStorageToV2(localStorage, new Date().toISOString());
if (migration.status === 'failed') {
  console.error('Schema v2 migration failed; affected writes are blocked.', migration.error);
  for (const slice of ['tasks', 'essentialsState', 'essentialHistory'] as const) {
    registerBlockedSlice({ slice, reason: 'quarantine-failed', detail: migration.error });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/mydailyflow/service-worker.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}
