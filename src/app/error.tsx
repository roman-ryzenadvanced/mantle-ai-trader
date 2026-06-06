'use client';
 
/**
 * Global Error Boundary for Mantle AI Trading Bot
 * QA-FIX #13: Added error boundary to prevent the entire app from crashing
 * when an unhandled error occurs in a client component. Without this,
 * Next.js would show a blank page or a raw error stack trace.
 */

import { useEffect } from 'react';
 
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Unhandled error caught by error boundary:', error);
  }, [error]);
 
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>
        Something went wrong!
      </h2>
      <p style={{ color: '#666', marginBottom: '1.5rem', textAlign: 'center', maxWidth: '500px' }}>
        An unexpected error occurred in the trading application. 
        Your data is safe - this is a display error only.
      </p>
      <button
        onClick={reset}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          cursor: 'pointer',
          fontSize: '1rem',
        }}
      >
        Try again
      </button>
    </div>
  );
}
