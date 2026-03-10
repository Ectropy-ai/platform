import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Check for available Babel presets
let hasPresetEnv = false;
let hasPresetTypescript = false;
let hasPresetReact = false;

try {
  require.resolve('@babel/preset-env');
  hasPresetEnv = true;
} catch (_e) {
  // Preset not available
}

try {
  require.resolve('@babel/preset-typescript');
  hasPresetTypescript = true;
} catch (_e) {
  // Preset not available
}

try {
  require.resolve('@babel/preset-react');
  hasPresetReact = true;
} catch (_e) {
  // Preset not available
}

// Build presets array based on what's available
const presets = [];
if (hasPresetEnv) {
  presets.push([
    '@babel/preset-env',
    {
      targets: { node: '20' },
      modules: false, // Preserve ES modules for Jest
    },
  ]);
}
if (hasPresetReact) {
  presets.push([
    '@babel/preset-react',
    {
      runtime: 'automatic', // Use React 17+ automatic JSX runtime
    },
  ]);
}
if (hasPresetTypescript) {
  presets.push([
    '@babel/preset-typescript',
    {
      allowNamespaces: true,
      allowDeclareFields: true,
    },
  ]);
}

// Test environment presets
const testPresets = [];
if (hasPresetEnv) {
  testPresets.push([
    '@babel/preset-env',
    {
      targets: { node: '20' },
      modules: 'commonjs', // Use CommonJS for Jest tests
    },
  ]);
}
if (hasPresetReact) {
  testPresets.push([
    '@babel/preset-react',
    {
      runtime: 'automatic', // Use React 17+ automatic JSX runtime
    },
  ]);
}
if (hasPresetTypescript) {
  testPresets.push([
    '@babel/preset-typescript',
    {
      allowNamespaces: true,
      allowDeclareFields: true,
    },
  ]);
}

export default {
  presets,
  plugins: [],
  env: {
    test: {
      presets: testPresets,
    },
  },
};
