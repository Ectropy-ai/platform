import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ectropy Developer Portal',
  description:
    'API Documentation and SDK Resources for the Ectropy Federated Construction Platform',
};

// CRITICAL: Force dynamic rendering for entire app (required for swagger-ui-react)
// This prevents Next.js from attempting to prerender ANY pages including error pages
// swagger-ui-react has dependencies that import next/document which breaks App Router SSR
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="nav-bar">
          <div className="nav-container">
            <h1 className="nav-title">Ectropy Developer Portal</h1>
            <div className="nav-links">
              <a href="/">Home</a>
              <a href="/getting-started">Getting Started</a>
              <a href="/api">API Reference</a>
              <a
                href="https://github.com/luhtech/Ectropy"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>
        <main className="main-content">{children}</main>
        <footer className="footer">
          <p>© 2025 Ectropy Platform. Licensed under Apache 2.0.</p>
        </footer>
      </body>
    </html>
  );
}
