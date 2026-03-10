// Mock recharts exports for TypeScript compilation when recharts is not available
// Note: This file should only be used when the actual recharts package is not installed
// The web-dashboard app uses the real recharts package and should not use these mocks

// These types are only used for server-side builds and non-React environments
declare module 'recharts' {
  import { ReactElement } from 'react';
  
  export const LineChart: () => ReactElement | null;
  export const Line: () => ReactElement | null;
  export const XAxis: () => ReactElement | null;
  export const YAxis: () => ReactElement | null;
  export const CartesianGrid: () => ReactElement | null;
  export const Tooltip: () => ReactElement | null;
  export const ResponsiveContainer: () => ReactElement | null;
  export const AreaChart: () => ReactElement | null;
  export const Area: () => ReactElement | null;
  export const BarChart: () => ReactElement | null;
  export const Bar: () => ReactElement | null;
  export const PieChart: () => ReactElement | null;
  export const Pie: () => ReactElement | null;
  export const Cell: () => ReactElement | null;
}
