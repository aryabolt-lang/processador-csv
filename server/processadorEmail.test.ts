import { describe, it, expect } from "vitest";
import { parseEmailFile, processEmailData } from "./processadorEmail";

// Helper: create a CSV buffer from rows
function makeCsv(rows: string[][]): Buffer {
  const lines = rows.map((r) => r.map((c) => `"${c}"`).join(","));
  return Buffer.from(lines.join("\n"), "utf-8");
}

const HEADERS = [
  "Protocolo", "Devedor", "CPF/CNPJ Devedor",
  "E-MAIL 01", "E-MAIL 02", "E-MAIL 03",
  "Valor Protesto", "Credor", "CPF/CNPJ Credor",
];

function makeRow(proto: string, nome: string, doc: string, e1: string, e2: string, e3: string, valor = "1000", credor = "Credor SA", docCred = "12.345.678/0001-90") {
  return [proto, nome, doc, e1, e2, e3, valor, credor, docCred];
}

describe("processadorEmail - parseEmailFile", () => {
  it("detects email columns automatically", () => {
    const csv = makeCsv([HEADERS, makeRow("P001", "João", "123.456.789-00", "joao@email.com", "", "")]);
    const result = parseEmailFile(csv, "text/csv", "test.csv");
    expect(result.suggestions.emailCols).toContain("E-MAIL 01");
    expect(result.suggestions.nomeCol).toBe("Devedor");
    expect(result.suggestions.documentoCol).toBe("CPF/CNPJ Devedor");
    expect(result.suggestions.protocoloCol).toBe("Protocolo");
  });

  it("returns preview rows limited to 10", () => {
    const rows = [HEADERS];
    for (let i = 0; i < 20; i++) {
      rows.push(makeRow(`P${i}`, `Nome ${i}`, "123.456.789-00", `email${i}@test.com`, "", ""));
    }
    const csv = makeCsv(rows);
    const result = parseEmailFile(csv, "text/csv", "test.csv");
    expect(result.previewRows.length).toBeLessThanOrEqual(10);
    expect(result.totalRows).toBe(20);
  });
});

describe("processadorEmail - processEmailData", () => {
  const mapping = {
    nomeCol: "Devedor",
    documentoCol: "CPF/CNPJ Devedor",
    protocoloCol: "Protocolo",
    valorCol: "Valor Protesto",
    nomeCredorCol: "Credor",
    docCredorCol: "CPF/CNPJ Credor",
    emailCols: ["E-MAIL 01", "E-MAIL 02", "E-MAIL 03"],
    spamThreshold: 5,
  };

  it("deduplicates emails across protocols - same email in 3 protocols = 1 line", () => {
    const csv = makeCsv([
      HEADERS,
      makeRow("P001", "João", "111.111.111-11", "joao@email.com", "", ""),
      makeRow("P002", "João", "111.111.111-11", "joao@email.com", "", ""),
      makeRow("P003", "João", "111.111.111-11", "joao@email.com", "", ""),
    ]);
    const result = processEmailData(csv, "text/csv", "test.csv", mapping);
    expect(result.uniqueEmails).toBe(1);
    expect(result.normalEmails + result.flaggedEmails).toBe(1);
  });

  it("expands multiple email columns into separate entries", () => {
    const csv = makeCsv([
      HEADERS,
      makeRow("P001", "Maria", "222.222.222-22", "maria1@email.com", "maria2@email.com", "maria3@email.com"),
    ]);
    const result = processEmailData(csv, "text/csv", "test.csv", mapping);
    expect(result.uniqueEmails).toBe(3);
    expect(result.rowsWithEmail).toBe(1);
  });

  it("flags emails above spam threshold", () => {
    const rows = [HEADERS];
    for (let i = 0; i < 6; i++) {
      rows.push(makeRow(`P00${i}`, `Devedor ${i}`, "333.333.333-33", "spam@email.com", "", ""));
    }
    const csv = makeCsv(rows);
    const result = processEmailData(csv, "text/csv", "test.csv", { ...mapping, spamThreshold: 5 });
    expect(result.flaggedEmails).toBe(1);
    expect(result.normalEmails).toBe(0);
  });

  it("does not flag emails below spam threshold", () => {
    const rows = [HEADERS];
    for (let i = 0; i < 3; i++) {
      rows.push(makeRow(`P00${i}`, `Devedor ${i}`, "444.444.444-44", "ok@email.com", "", ""));
    }
    const csv = makeCsv(rows);
    const result = processEmailData(csv, "text/csv", "test.csv", { ...mapping, spamThreshold: 5 });
    expect(result.normalEmails).toBe(1);
    expect(result.flaggedEmails).toBe(0);
  });

  it("excludes rows without any valid email", () => {
    const csv = makeCsv([
      HEADERS,
      makeRow("P001", "Sem Email", "555.555.555-55", "", "", ""),
      makeRow("P002", "Com Email", "666.666.666-66", "com@email.com", "", ""),
    ]);
    const result = processEmailData(csv, "text/csv", "test.csv", mapping);
    expect(result.rowsWithoutEmail).toBe(1);
    expect(result.rowsWithEmail).toBe(1);
  });

  it("ignores 'Sem contato' values in email columns", () => {
    const csv = makeCsv([
      HEADERS,
      makeRow("P001", "Devedor", "777.777.777-77", "Sem contato", "Sem contato", ""),
    ]);
    const result = processEmailData(csv, "text/csv", "test.csv", mapping);
    expect(result.rowsWithoutEmail).toBe(1);
    expect(result.uniqueEmails).toBe(0);
  });

  it("normalizes email to lowercase for deduplication", () => {
    const csv = makeCsv([
      HEADERS,
      makeRow("P001", "A", "111.111.111-11", "JOAO@EMAIL.COM", "", ""),
      makeRow("P002", "A", "111.111.111-11", "joao@email.com", "", ""),
    ]);
    const result = processEmailData(csv, "text/csv", "test.csv", mapping);
    expect(result.uniqueEmails).toBe(1);
  });

  it("generates valid CSV output with correct columns", () => {
    const csv = makeCsv([
      HEADERS,
      makeRow("P001", "João Silva", "123.456.789-00", "joao@email.com", "", ""),
    ]);
    const result = processEmailData(csv, "text/csv", "test.csv", mapping);
    const csvStr = result.normalCsv.toString("utf-8").replace(/^\uFEFF/, "");
    const lines = csvStr.split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2); // header + 1 data row
    expect(lines[0]).toContain("E-MAIL");
    expect(lines[1]).toContain("joao@email.com");
    expect(lines[1]).toContain("João Silva");
  });

  it("concatenates multiple protocols with pipe separator", () => {
    const csv = makeCsv([
      HEADERS,
      makeRow("PROT-A", "João", "111.111.111-11", "joao@email.com", "", ""),
      makeRow("PROT-B", "João", "111.111.111-11", "joao@email.com", "", ""),
    ]);
    const result = processEmailData(csv, "text/csv", "test.csv", mapping);
    const csvStr = result.normalCsv.toString("utf-8");
    expect(csvStr).toContain("PROT-A");
    expect(csvStr).toContain("PROT-B");
    expect(csvStr).toContain("|");
  });

  it("totalRows matches input rows", () => {
    const rows = [HEADERS];
    for (let i = 0; i < 50; i++) {
      rows.push(makeRow(`P${i}`, `Nome ${i}`, "111.111.111-11", `email${i}@test.com`, "", ""));
    }
    const csv = makeCsv(rows);
    const result = processEmailData(csv, "text/csv", "test.csv", mapping);
    expect(result.totalRows).toBe(50);
  });
});
