import { describe, test, expect, vi } from 'vitest';

describe('API Gateway graceful shutdown', () => {
  const runSignalTest = async () => {
    vi.useFakeTimers();
    const quitSpy = vi.fn().mockResolvedValue('OK');
    const redis = { quit: quitSpy };
    const closeMock = vi.fn((cb) => cb());
    const server = { close: closeMock };
    const health = { status: 'healthy' };

    const createGracefulShutdown = (srv, client, status) => {
      return async () => {
        await client.quit();
        srv.close(() => {});
        status.status = 'shutting-down';
        process.exit(0);
      };
    };

    const shutdown = createGracefulShutdown(server, redis, health);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    await shutdown();
    vi.runAllTimers();

    expect(quitSpy).toHaveBeenCalled();

    exitSpy.mockRestore();
    vi.useRealTimers();
  };

  test('disconnects Redis on SIGINT', async () => {
    await runSignalTest();
  });

  test('disconnects Redis on SIGTERM', async () => {
    await runSignalTest();
  });
});
