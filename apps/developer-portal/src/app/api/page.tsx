'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

// Force dynamic rendering for this route (required for swagger-ui-react)
// This prevents static generation which causes useContext errors with swagger-ui
export const dynamicParams = true;
export const revalidate = 0;

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function ApiReferencePage() {
  return (
    <div>
      <h1 style={{ marginBottom: '1rem' }}>API Reference</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Interactive API documentation powered by OpenAPI 3.0. Try out API calls
        directly from this page.
      </p>
      <div className="swagger-wrapper">
        <SwaggerUI
          url="/openapi.yaml"
          docExpansion="list"
          defaultModelsExpandDepth={1}
          defaultModelExpandDepth={1}
        />
      </div>
    </div>
  );
}
