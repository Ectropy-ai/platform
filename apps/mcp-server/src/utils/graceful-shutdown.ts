export const setupGracefulShutdown = (server: any) => {
  const shutdown = (_signal: string) => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
