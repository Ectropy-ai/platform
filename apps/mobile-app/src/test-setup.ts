import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-reanimated', () => {
  // Use dynamic import for ESM compatibility
  const Reanimated = jest.requireActual('react-native-reanimated/mock');

  // The mock for `call` immediately calls the callback which is incorrect
  // So we override it with a no-op
  Reanimated.default.call = () => {
    // No-op override for testing
  };

  return Reanimated;
});

// Silence the warning: Animated: `useNativeDriver` is not supported because the native animated module is missing
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');