'use client';

export default function NotFound() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>404 - Page Not Found</h1>
      <p style={{ marginTop: '1rem', color: '#666' }}>
        The page you're looking for doesn't exist.
      </p>
      <a
        href="/"
        style={{
          display: 'inline-block',
          marginTop: '2rem',
          padding: '0.5rem 1rem',
          backgroundColor: '#0070f3',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '4px',
        }}
      >
        Go Home
      </a>
    </div>
  );
}
