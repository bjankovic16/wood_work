// The parts of pdfmake 0.3 the app uses.
declare module 'pdfmake/build/pdfmake' {
  interface PdfDocument {
    getBlob(): Promise<Blob>;
  }
  interface PdfMake {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    createPdf(definition: object): PdfDocument;
  }
  const pdfMake: PdfMake;
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>;
  export default vfs;
}
