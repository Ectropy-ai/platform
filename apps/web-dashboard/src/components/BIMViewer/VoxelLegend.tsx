/**
 * VoxelLegend — Color legend for voxel overlay visualization.
 *
 * Extracted from VoxelOverlay.tsx as part of DEC-008.
 * Imports types and color palettes from VoxelTypes.ts.
 *
 * @module BIMViewer/VoxelLegend
 */

import React, { useMemo } from 'react';
import {
  VoxelColorScheme,
  SYSTEM_COLORS,
  STATUS_COLORS,
  HEALTH_COLORS,
  type VoxelLegendProps,
} from './VoxelTypes';

export const VoxelLegend: React.FC<VoxelLegendProps> = ({
  colorScheme,
  className = '',
}) => {
  const items = useMemo(() => {
    switch (colorScheme) {
      case VoxelColorScheme.BY_SYSTEM:
        return Object.entries(SYSTEM_COLORS).map(([key, color]) => ({
          label: key,
          color,
        }));

      case VoxelColorScheme.BY_STATUS:
        return Object.entries(STATUS_COLORS).map(([key, color]) => ({
          label: key.replace('_', ' '),
          color,
        }));

      case VoxelColorScheme.BY_HEALTH:
        return Object.entries(HEALTH_COLORS).map(([key, color]) => ({
          label: key.replace('_', ' '),
          color,
        }));

      case VoxelColorScheme.BY_PROGRESS:
        return [
          { label: '0%', color: '#ff0000' },
          { label: '25%', color: '#ff8000' },
          { label: '50%', color: '#ffff00' },
          { label: '75%', color: '#80ff00' },
          { label: '100%', color: '#00ff00' },
        ];

      case VoxelColorScheme.BY_DECISION_DENSITY:
        return [
          { label: 'No Decisions', color: '#0000ff' },
          { label: 'Few Decisions', color: '#8000ff' },
          { label: 'Many Decisions', color: '#ff0000' },
        ];

      default:
        return [];
    }
  }, [colorScheme]);

  return (
    <div className={`voxel-legend ${className}`}>
      <div className="legend-title">
        {colorScheme.replace('BY_', '').replace('_', ' ')}
      </div>
      <div className="legend-items">
        {items.map((item) => (
          <div key={item.label} className="legend-item">
            <div
              className="legend-color"
              style={{ backgroundColor: item.color }}
            />
            <span className="legend-label">{item.label}</span>
          </div>
        ))}
      </div>
      <style>{`
        .voxel-legend {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 8px;
          padding: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          min-width: 150px;
        }
        .legend-title {
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          color: #333;
          margin-bottom: 8px;
          border-bottom: 1px solid #eee;
          padding-bottom: 4px;
        }
        .legend-items {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .legend-color {
          width: 16px;
          height: 16px;
          border-radius: 3px;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }
        .legend-label {
          font-size: 11px;
          color: #666;
          text-transform: capitalize;
        }
      `}</style>
    </div>
  );
};

export default VoxelLegend;
