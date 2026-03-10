/**
 * ==============================================================================
 * CONSOLE LAYOUT
 * ==============================================================================
 * Main layout wrapper with sidebar navigation and header.
 * Provides consistent structure for all console pages.
 * ==============================================================================
 */

import React from 'react';
import { Box } from '@mui/material';
import ConsoleSidebar from './ConsoleSidebar';
import ConsoleHeader from './ConsoleHeader';

const SIDEBAR_WIDTH = 240;
const HEADER_HEIGHT = 64;

interface ConsoleLayoutProps {
  children: React.ReactNode;
}

const ConsoleLayout: React.FC<ConsoleLayoutProps> = ({ children }) => {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <ConsoleSidebar width={SIDEBAR_WIDTH} />

      {/* Main content area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          ml: `${SIDEBAR_WIDTH}px`,
          minHeight: '100vh',
        }}
      >
        {/* Header */}
        <ConsoleHeader height={HEADER_HEIGHT} />

        {/* Page content */}
        <Box
          sx={{
            flexGrow: 1,
            p: 3,
            mt: `${HEADER_HEIGHT}px`,
            backgroundColor: 'background.default',
            overflow: 'auto',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default ConsoleLayout;
