import { describe, it, expect } from '@jest/globals';
import { ClashDetector, Clash } from '../index';

describe('ClashDetector', () => {
  it('prioritizes clashes by severity then cost', () => {
    const detector = new ClashDetector();
    const clashes: Clash[] = [
      {
        id: '1',
        element1: 'A',
        element2: 'B',
        type: 'hard',
        severity: 'major',
        location: { x: 0, y: 0, z: 0 },
        cost: 1000,
      },
      {
        id: '2',
        element1: 'C',
        element2: 'D',
        type: 'hard',
        severity: 'critical',
        location: { x: 0, y: 0, z: 0 },
        cost: 500,
      },
      {
        id: '3',
        element1: 'E',
        element2: 'F',
        type: 'hard',
        severity: 'major',
        location: { x: 0, y: 0, z: 0 },
        cost: 2000,
      },
    ];

    (detector as any).clashes = clashes;
    const prioritized = (detector as any).prioritizeClashes();

    expect(prioritized.map((c: Clash) => c.id)).toEqual(['2', '3', '1']);
  });

  it('generates a summary report', () => {
    const detector = new ClashDetector();
    const clashes: Clash[] = [
      {
        id: '1',
        element1: 'A',
        element2: 'B',
        type: 'hard',
        severity: 'critical',
        location: { x: 0, y: 0, z: 0 },
        cost: 1000,
      },
      {
        id: '2',
        element1: 'C',
        element2: 'D',
        type: 'soft',
        severity: 'major',
        location: { x: 0, y: 0, z: 0 },
        cost: 500,
      },
    ];

    (detector as any).clashes = clashes;
    const report = detector.generateReport();

    expect(report).toContain('Critical: 1');
    expect(report).toContain('Major: 1');
    expect(report).toContain('Total Clashes: 2');
    expect(report).toContain('Estimated Cost Impact: $1,500');
  });
});
