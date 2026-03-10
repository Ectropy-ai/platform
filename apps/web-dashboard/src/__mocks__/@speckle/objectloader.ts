// Mock for @speckle/objectloader to avoid Node.js subpath import issues in Jest
export default class MockObjectLoader {
  load = () => Promise.resolve({});
  dispose = () => {};
  getWorldTree = () => ({});
}
