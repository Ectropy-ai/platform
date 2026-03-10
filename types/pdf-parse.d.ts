declare module 'pdf-parse' {
  import type { Buffer } from 'node:buffer';
  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }
  function pdfParse(
    data: Buffer | Uint8Array | ArrayBuffer,
    options?: any
  ): Promise<PDFParseResult>;
  export default pdfParse;
}
