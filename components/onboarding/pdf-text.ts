// Reads a PDF's text on the student's device with PDF.js (the unpdf build the server uses too),
// so a PDF of any size can be used: only the page text is sent, never the file. For PDFs over
// the upload cap (UploadField). Scans have no text layer and come back empty.
import { capPageTexts, MAX_PDF_CHARS, MAX_PDF_PAGES, normalizePageText, type PageText } from "@/lib/rag/chunk";

/** An error whose message is safe to show to the student. */
export class PdfReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfReadError";
  }
}

/** Page text, capped like server-side extraction. Loads PDF.js only when first called. */
export async function readPdfPages(file: File, onPage?: (page: number, total: number) => void): Promise<PageText[]> {
  const { getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    console.error("[pdf] open failed", err);
    throw new PdfReadError(`Couldn't open "${file.name}". If it's password-protected, remove the password and try again.`);
  }
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new PdfReadError(`That PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}. Split it and upload the parts.`);
    }
    const raw: PageText[] = [];
    let chars = 0;
    for (let i = 1; i <= pdf.numPages && chars < MAX_PDF_CHARS; i++) {
      onPage?.(i, pdf.numPages);
      const page = await pdf.getPage(i);
      const { items } = await page.getTextContent();
      // Same joining as unpdf's extractText on the server.
      const text = items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : "")).join("");
      page.cleanup();
      raw.push({ page: i, text });
      chars += normalizePageText(text).length;
      await new Promise((resolve) => setTimeout(resolve, 0)); // let the progress label paint
    }
    return capPageTexts(raw);
  } finally {
    await pdf.loadingTask.destroy();
  }
}
