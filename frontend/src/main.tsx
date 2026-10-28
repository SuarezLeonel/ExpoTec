import React from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/base.css';
import './styles/light.css';
import './styles/dark.css';
import './styles/salon.css';
import './styles/design-system.css';
import './styles/ordering.css';
import './styles/terminal.css';
import './styles/floor-fit.css';
import { ThemeProvider } from './contexts/Theme';
import { StoreProvider } from './contexts/Store';
import { App } from './app';
import { ScrollToTop } from './components/ScrollToTop';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <StoreProvider>
        <App />
        <ScrollToTop />
      </StoreProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
