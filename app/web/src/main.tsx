import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import '@coreui/coreui/dist/css/coreui.min.css';
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
          background: '#f3f4f7',
          boxSizing: 'border-box',
          color: '#2f353a',
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
            border: '1px solid #d8dbe0',
            borderRadius: '8px',
            boxShadow: '0 3px 10px rgba(44, 56, 74, 0.12)',
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
