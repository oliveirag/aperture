import { parseReviewCsv, parsePositionsCsv, type CsvResult } from "./csv";

export type SheetResult = { name: string; result: CsvResult };

// Excel is parsed locally. Formula text and macros are never executed. Cached cell values only.
export async function readWorkbook(buffer: ArrayBuffer, review = false): Promise<SheetResult[]> {
  const { read, utils } = await import("xlsx");
  const book = read(buffer, { type: "array", cellFormula: false, cellHTML: false, sheetRows: 5002 });
  if (book.SheetNames.length > 30) throw new Error("This workbook has more than 30 sheets. Export the positions sheet as CSV.");
  const sheets = book.SheetNames.filter((_, i) => !book.Workbook?.Sheets?.[i]?.Hidden);
  return sheets.map(name => {
    const sheet = book.Sheets[name];
    const range = utils.decode_range(sheet["!fullref"] ?? sheet["!ref"] ?? "A1");
    if (range.e.r >= 5000 || range.e.c > 100) throw new Error("Choose a positions sheet with at most 5,000 rows and 100 columns.");
    return { name, result: (review ? parseReviewCsv : parsePositionsCsv)(utils.sheet_to_csv(sheet, { blankrows: false })) };
  });
}
