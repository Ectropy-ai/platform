import { describe, it, expect, beforeEach } from '@jest/globals';
import { IFCProcessor } from '../processor';

describe('IFC Processor', () => {
  let processor: IFCProcessor;

  beforeEach(() => {
    processor = new IFCProcessor();
  });

  it('should parse IFC data', async () => {
    const mockIFC = Buffer.from(`
      IFC2X3;
      #1=IFCBEAM('guid1',$,'Beam',$,$,$,$);
      #2=IFCCOLUMN('guid2',$,'Column',$,$,$,$);
    `);

    await processor.parse(mockIFC);
    const quantities = await processor.extractQuantities();

    expect(quantities).toBeDefined();
    expect(quantities.totalVolume).toBeGreaterThanOrEqual(0);
  });

  it('should detect clashes between elements', async () => {
    const mockIFC = Buffer.from(`
      #1=IFCBEAM('beam1',$,'Beam',$,$,$,$);
      #2=IFCPIPE('pipe1',$,'Pipe',$,$,$,$);
    `);

    await processor.parse(mockIFC);
    const clashes = await processor.detectClashes();

    expect(Array.isArray(clashes)).toBe(true);
  });
});
