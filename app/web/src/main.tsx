import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class RootErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main
        role="alert"
        style={{
          alignItems: 'center',
          background: '#fff5f5',
          boxSizing: 'border-box',
          color: '#172033',
          display: 'flex',
          fontFamily: 'system-ui, sans-serif',
          justifyContent: 'center',
          minHeight: '100dvh',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <section
          style={{
            background: '#fff',
            border: '1px solid #fecdd3',
            borderRadius: '20px',
            boxShadow: '0 8px 30px rgba(183, 23, 29, 0.12)',
            maxWidth: '420px',
            padding: '28px',
            width: '100%',
          }}
        >
          <h1 style={{ color: '#b8171d', fontSize: '20px', margin: '0 0 10px' }}>Halaman perlu dimuat ulang</h1>
          <p style={{ color: '#475569', fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px' }}>
            Terjadi kendala saat menampilkan hasil verifikasi lokasi. Data verifikasi Anda tidak hilang.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: '#d71920',
              border: 0,
              borderRadius: '10px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
              padding: '13px 18px',
              width: '100%',
            }}
          >
            Muat ulang halaman
          </button>
        </section>
      </main>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
