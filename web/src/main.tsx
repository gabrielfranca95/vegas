import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthGate } from './lib/auth';
import { DataProvider } from './lib/store';
import { ToastProvider } from './lib/toast';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthGate>
        <DataProvider>
          <App />
        </DataProvider>
      </AuthGate>
    </ToastProvider>
  </StrictMode>,
);
