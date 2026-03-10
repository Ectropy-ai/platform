// Basic test to verify Jest configuration
describe('Jest Configuration', () => {
  it('should run basic tests', () => {
    expect(true).toBe(true);
  });

  it('should handle async tests', async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });

  it('should mock functions', () => {
    const mockFn = jest.fn();
    mockFn('test');
    expect(mockFn).toHaveBeenCalledWith('test');
  });
});
