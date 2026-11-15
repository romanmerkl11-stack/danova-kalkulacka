import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { calculate, defaultInput } from "../engine/calc";
import { buildXlsx } from "./xlsx";

describe("export XLSX", () => {
  it("vytvorí zošit so všetkými hárkami, hodnotou dane a SUM vzorcom", async () => {
    const input = defaultInput(2024);
    input.income.annual = 31500;
    input.insurance.shiftOneMonth = false;
    const result = calculate(input);
    const bytes = await buildXlsx(result, input, { title: "Test", companyName: "Firma s.r.o.", ico: "12345678", createdAt: "2025-01-15T10:00:00Z" });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Súhrn", "Mesiace", "Postup", "Limity", "Budúci rok"]);

    const su = wb.getWorksheet("Súhrn")!;
    const values: unknown[] = [];
    su.eachRow((r) => values.push(r.getCell(2).value));
    expect(values).toContain(result.summary.tax);
    expect(result.summary.tax).toBe(477.95);

    const me = wb.getWorksheet("Mesiace")!;
    const total = me.getCell("C14").value as { formula: string; result: number };
    expect(total.formula).toBe("SUM(C2:C13)");
    expect(total.result).toBe(31500);

    const po = wb.getWorksheet("Postup")!;
    let flag: unknown;
    po.eachRow((r) => {
      if (String(r.getCell(2).value).length && r.getCell(3).value === "áno") flag = "áno";
    });
    expect(flag).toBe("áno");
  });
});
