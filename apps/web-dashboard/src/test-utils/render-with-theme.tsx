import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { ectropyTheme } from '../theme/ectropy-theme';

/**
 * Custom render function that wraps components with ThemeProvider
 * Required for testing Material-UI components
 */
export function renderWithTheme(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    wrapper: ({ children }) => <ThemeProvider theme={ectropyTheme}>{children}</ThemeProvider>,
    ...options,
  });
}

// Re-export everything from @testing-library/react
export * from '@testing-library/react';
