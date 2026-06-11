import { describe, it, expect } from "vitest";
import { detectColumns, processData, parseFile } from "./processador";
import type { ColMapping } from "./processador";

// ─────────────────────────────────────────────
// detectColumns
// ─────────────────────────────────────────────
describe("detectColumns", () => {
  it("identifies standard headers correctly", () => {
    const headers = ["Devedor", "CPF/CNPJ Devedor", "TELEFONE 01", "TELEFONE 02", "TELEFONE 03", "TELEFONE 04", "PROTOCOLO INTIMADO"];
    const suggestions = detectColumns(headers, []);
    const byField = Object.fromEntries(suggestions.map((s) => [s.field, s]));

    expect(byField.nome.column).toBe("Devedor");
    expect(byField.documento.column).toBe("CPF/CNPJ Devedor");
    expect(byField.telefone1.column).toBe("TELEFONE 01");
    expect(byField.telefone2.column).toBe("TELEFONE 02");
    expect(byField.telefone3.column).toBe("TELEFONE 03");
    expect(byField.telefone4.column).toBe("TELEFONE 04");
    // semContato is no longer auto-detected as a separate column — it is detected directly in phone cells
    expect(byField.semContato.column).toBeNull();
  });

  it("handles missing phone columns gracefully", () => {
    const headers = ["Nome", "CPF"];
    const suggestions = detectColumns(headers, []);
    const byField = Object.fromEntries(suggestions.map((s) => [s.field, s]));
    expect(byField.telefone1.column).toBeNull();
    expect(byField.telefone2.column).toBeNull();
  });
});

// ─────────────────────────────────────────────
// processData – CPF vs CNPJ classification
// ─────────────────────────────────────────────
describe("processData – CPF/CNPJ classification", () => {
  const mapping: ColMapping = {
    nome: "nome",
    documento: "doc",
    telefone1: "tel1",
    telefone2: null,
    telefone3: null,
    telefone4: null,
    semContato: null,
  };

  it("classifies 11-digit document as CPF", () => {
    const rows = [{ nome: "João Silva", doc: "123.456.789-01", tel1: "11999990000" }];
    const result = processData(rows, mapping);
    expect(result.totalCpf).toBe(1);
    expect(result.totalCnpj).toBe(0);
  });

  it("classifies 14-digit document as CNPJ", () => {
    const rows = [{ nome: "Empresa SA", doc: "12.345.678/0001-90", tel1: "11999990000" }];
    const result = processData(rows, mapping);
    expect(result.totalCnpj).toBe(1);
    expect(result.totalCpf).toBe(0);
  });

  it("counts invalid documents separately", () => {
    const rows = [{ nome: "Sem Doc", doc: "123", tel1: "11999990000" }];
    const result = processData(rows, mapping);
    expect(result.totalInvalidos).toBe(1);
  });
});

// ─────────────────────────────────────────────
// processData – phone expansion
// ─────────────────────────────────────────────
describe("processData – phone expansion", () => {
  const mapping: ColMapping = {
    nome: "nome",
    documento: "doc",
    telefone1: "tel1",
    telefone2: "tel2",
    telefone3: "tel3",
    telefone4: "tel4",
    semContato: null,
  };

  it("expands 4 phones into 4 rows", () => {
    const rows = [{
      nome: "Ellenita",
      doc: "111.111.111-11",
      tel1: "11999990001",
      tel2: "11999990002",
      tel3: "11999990003",
      tel4: "11999990004",
    }];
    const result = processData(rows, mapping);
    expect(result.totalLinhasGeradas).toBe(4);
  });

  it("expands 2 phones into 2 rows", () => {
    const rows = [{
      nome: "Maria",
      doc: "222.222.222-22",
      tel1: "11999990001",
      tel2: "11999990002",
      tel3: "",
      tel4: "",
    }];
    const result = processData(rows, mapping);
    expect(result.totalLinhasGeradas).toBe(2);
  });

  it("does not generate rows for empty phones", () => {
    const rows = [{
      nome: "Sem Fone",
      doc: "333.333.333-33",
      tel1: "",
      tel2: "",
      tel3: "",
      tel4: "",
    }];
    const result = processData(rows, mapping);
    expect(result.totalLinhasGeradas).toBe(0);
    expect(result.totalSemContato).toBe(1);
  });
});

// ─────────────────────────────────────────────
// processData – sem contato exclusion
// ─────────────────────────────────────────────
describe("processData – sem contato exclusion", () => {
  const mapping: ColMapping = {
    nome: "nome",
    documento: "doc",
    telefone1: "tel1",
    telefone2: null,
    telefone3: null,
    telefone4: null,
    semContato: "sc",
  };

  it("excludes records marked as sem contato", () => {
    const rows = [
      { nome: "Com Contato", doc: "111.111.111-11", tel1: "11999990001", sc: "" },
      { nome: "Sem Contato", doc: "222.222.222-22", tel1: "11999990002", sc: "Intimação não localizada" },
    ];
    const result = processData(rows, mapping);
    expect(result.totalComContato).toBe(1);
    expect(result.totalSemContato).toBe(1);
    expect(result.totalLinhasGeradas).toBe(1);
  });

  it("excludes records with 'sim' in sem contato field", () => {
    const rows = [{ nome: "Bloqueado", doc: "111.111.111-11", tel1: "11999990001", sc: "sim" }];
    const result = processData(rows, mapping);
    expect(result.totalSemContato).toBe(1);
    expect(result.totalLinhasGeradas).toBe(0);
  });
});

// ─────────────────────────────────────────────
// processData – sem contato in phone cells (new behavior)
// ─────────────────────────────────────────────
describe("processData – sem contato in phone cells", () => {
  const mapping: ColMapping = {
    nome: "nome",
    documento: "doc",
    telefone1: "tel1",
    telefone2: "tel2",
    telefone3: "tel3",
    telefone4: "tel4",
    semContato: null, // no dedicated column
  };

  it("skips phone cells containing 'Sem contato' text", () => {
    const rows = [{
      nome: "João",
      doc: "111.111.111-11",
      tel1: "Sem contato",
      tel2: "Sem contato",
      tel3: "Sem contato",
      tel4: "Sem contato",
    }];
    const result = processData(rows, mapping);
    expect(result.totalLinhasGeradas).toBe(0);
    expect(result.totalSemContato).toBe(1);
  });

  it("only generates rows for valid phones, ignoring Sem contato cells", () => {
    const rows = [{
      nome: "Maria",
      doc: "111.111.111-11",
      tel1: "63984845505",
      tel2: "Sem contato",
      tel3: "63992319142",
      tel4: "Sem contato",
    }];
    const result = processData(rows, mapping);
    expect(result.totalLinhasGeradas).toBe(2);
    expect(result.totalComContato).toBe(1);
  });

  it("handles mixed case and whitespace in Sem contato cells", () => {
    const rows = [{
      nome: "Carlos",
      doc: "111.111.111-11",
      tel1: "  SEM CONTATO  ",
      tel2: "",
      tel3: "",
      tel4: "",
    }];
    const result = processData(rows, mapping);
    expect(result.totalLinhasGeradas).toBe(0);
    expect(result.totalSemContato).toBe(1);
  });
});

// ─────────────────────────────────────────────
// processData – ligacao CSV format (semicolon, col A and AD)
// ─────────────────────────────────────────────
describe("processData – ligacao CSV format", () => {
  const mapping: ColMapping = {
    nome: "nome",
    documento: "doc",
    telefone1: "tel1",
    telefone2: null,
    telefone3: null,
    telefone4: null,
    semContato: null,
  };
  const headers = ["nome", "doc", "tel1"];

  it("generates CPF ligacao CSV with semicolon separator", () => {
    const rows = [{ nome: "João", doc: "111.111.111-11", tel1: "11999990001" }];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    // Must use semicolon
    expect(csv).toContain(";");
    expect(csv).not.toMatch(/^[^;]*,[^;]*$/m); // no comma-only lines
  });

  it("includes header row as first line", () => {
    const rows = [{ nome: "Maria Silva", doc: "111.111.111-11", tel1: "11999990001" }];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const lines = csv.split(/\r?\n/);
    // First line must be header (column names)
    expect(lines[0]).toContain("nome");
    // Second line must be data
    expect(lines[1]).toContain("Maria Silva");
  });

  it("places name in first column (col A = index 0) of data row", () => {
    const rows = [{ nome: "Maria Silva", doc: "111.111.111-11", tel1: "11999990001" }];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const dataLine = csv.split(/\r?\n/)[1]; // index 1 = first data row (index 0 = header)
    const cols = dataLine.split(";");
    expect(cols[0]).toBe("Maria Silva");
  });

  it("places phone in column AD (index 29) of data row", () => {
    const rows = [{ nome: "Maria Silva", doc: "111.111.111-11", tel1: "11999990001" }];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const dataLine = csv.split(/\r?\n/)[1];
    const cols = dataLine.split(";");
    expect(cols.length).toBeGreaterThanOrEqual(30);
    expect(cols[29]).toBe("11999990001");
  });

  it("cleans phone numbers (removes non-digits)", () => {
    const rows = [{ nome: "João", doc: "111.111.111-11", tel1: "(11) 9.9999-0001" }];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const dataLine = csv.split(/\r?\n/)[1];
    const cols = dataLine.split(";");
    expect(cols[29]).toBe("11999990001");
  });

  it("removes commas from cells in ligacao CSV", () => {
    const rows = [{ nome: "João, Silva", doc: "111.111.111-11", tel1: "11999990001" }];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    // No commas anywhere in the CSV
    expect(csv).not.toContain(",");
  });

  it("preserves commas in SMS CSV", () => {
    const rows = [{ nome: "João, Silva", doc: "111.111.111-11", tel1: "11999990001" }];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfSmsCsv.toString("utf-8");
    // Commas are kept in SMS
    expect(csv).toContain(",");
  });

  it("preserves all original columns in ligacao CSV data row", () => {
    const fullHeaders = ["nome", "doc", "extra1", "extra2", "tel1"];
    const rows = [{ nome: "Ana", doc: "111.111.111-11", extra1: "dado1", extra2: "dado2", tel1: "11999990001" }];
    const result = processData(rows, mapping, fullHeaders);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const dataLine = csv.split(/\r?\n/)[1]; // data row
    const cols = dataLine.split(";");
    // Original data preserved: extra1 at index 2, extra2 at index 3
    expect(cols[2]).toBe("dado1");
    expect(cols[3]).toBe("dado2");
    // Phone at AD (index 29)
    expect(cols[29]).toBe("11999990001");
  });

  it("moves protocolo column to col B (index 1)", () => {
    const protHeaders = ["nome", "outro", "Protocolo", "doc", "tel1"];
    const rows = [{ nome: "Ana", outro: "x", Protocolo: "PROT123", doc: "111.111.111-11", tel1: "11999990001" }];
    const result = processData(rows, { ...mapping, nome: "nome", documento: "doc", telefone1: "tel1" }, protHeaders);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const dataLine = csv.split(/\r?\n/)[1];
    const cols = dataLine.split(";");
    // Protocolo should be at index 1 (col B)
    expect(cols[1]).toBe("PROT123");
  });

  // ─── SMS-specific tests ───────────────────────

  it("SMS: client with 4 phones generates 4 rows with distinct phones at col U (index 20)", () => {
    const multiPhoneMapping = {
      ...mapping,
      telefone1: "tel1",
      telefone2: "tel2",
      telefone3: "tel3",
      telefone4: "tel4",
    };
    const multiHeaders = ["nome", "doc", "tel1", "tel2", "tel3", "tel4"];
    const rows = [{
      nome: "Vivaldo",
      doc: "111.111.111-11",
      tel1: "11999990001",
      tel2: "11999990002",
      tel3: "11999990003",
      tel4: "11999990004",
    }];
    const result = processData(rows, multiPhoneMapping, multiHeaders);
    const csv = result.cpfSmsCsv.toString("utf-8");
    const lines = csv.split(/\r?\n/).filter(Boolean);
    // 1 header + 4 data rows
    expect(lines.length).toBe(5);
    // Phone at col U = index 20
    const phones = lines.slice(1).map((l) => l.split(";")[20]);
    expect(phones).toEqual(["11999990001", "11999990002", "11999990003", "11999990004"]);
    // All rows have the same name at col A
    const names = lines.slice(1).map((l) => l.split(";")[0]);
    expect(names.every((n) => n === "Vivaldo")).toBe(true);
  });

  it("SMS: header row has col A=nome, col B=Protocolo, col U=TELEFONE", () => {
    const protHeaders = ["nome", "outro", "Protocolo", "doc", "tel1"];
    const rows = [{ nome: "Ana", outro: "x", Protocolo: "PROT123", doc: "111.111.111-11", tel1: "11999990001" }];
    const result = processData(rows, { ...mapping, nome: "nome", documento: "doc", telefone1: "tel1" }, protHeaders);
    const csv = result.cpfSmsCsv.toString("utf-8");
    const headerLine = csv.split(/\r?\n/)[0];
    const h = headerLine.split(";");
    expect(h[0]).toBe("nome");       // col A = nome
    expect(h[1]).toBe("Protocolo");  // col B = protocolo
    expect(h[20]).toBe("TELEFONE");  // col U = TELEFONE
  });

  it("SMS: preserves commas in cells (unlike ligacao)", () => {
    const rows = [{ nome: "João, Silva", doc: "111.111.111-11", tel1: "11999990001" }];
    const result = processData(rows, mapping, headers);
    const smsCsv = result.cpfSmsCsv.toString("utf-8");
    const ligCsv = result.cpfLigacaoCsv.toString("utf-8");
    // SMS keeps commas
    expect(smsCsv).toContain(",");
    // Ligacao has no commas
    expect(ligCsv).not.toContain(",");
  });
});

// ─────────────────────────────────────────────
// parseFile – CSV parsing
// ─────────────────────────────────────────────
describe("parseFile – CSV parsing", () => {
  it("parses comma-separated CSV", () => {
    const csv = "Nome,Documento,Telefone\nJoão,111.111.111-11,11999990001\n";
    const buf = Buffer.from(csv, "utf-8");
    const result = parseFile(buf, "text/csv", "test.csv");
    expect(result.headers).toEqual(["Nome", "Documento", "Telefone"]);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]["Nome"]).toBe("João");
  });

  it("parses semicolon-separated CSV", () => {
    const csv = "Nome;Documento;Telefone\nMaria;222.222.222-22;11999990002\n";
    const buf = Buffer.from(csv, "utf-8");
    const result = parseFile(buf, "text/csv", "test.csv");
    expect(result.headers).toEqual(["Nome", "Documento", "Telefone"]);
    expect(result.rows[0]["Nome"]).toBe("Maria");
  });
});

// ─────────────────────────────────────────────
// processData – LIGACAO phone deduplication
// ─────────────────────────────────────────────
describe("processData – LIGACAO phone deduplication", () => {
  const mapping: ColMapping = {
    nome: "nome",
    documento: "doc",
    telefone1: "tel1",
    telefone2: "tel2",
    telefone3: null,
    telefone4: null,
    semContato: null,
  };
  const headers = ["nome", "doc", "Protocolo", "tel1", "tel2"];

  it("deduplicates same phone across multiple rows in LIGACAO CSV", () => {
    // Two different debtors share the same phone number
    const rows = [
      { nome: "Devedor A", doc: "111.111.111-11", Protocolo: "PROT001", tel1: "11999990001", tel2: "" },
      { nome: "Devedor B", doc: "222.222.222-22", Protocolo: "PROT002", tel1: "11999990001", tel2: "" },
    ];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const lines = csv.split(/\r?\n/).filter(Boolean);
    // 1 header + 1 deduplicated data row (same phone)
    expect(lines.length).toBe(2);
  });

  it("merges protocols with ' / ' separator when phone is shared", () => {
    const rows = [
      { nome: "Devedor A", doc: "111.111.111-11", Protocolo: "PROT001", tel1: "11999990001", tel2: "" },
      { nome: "Devedor B", doc: "222.222.222-22", Protocolo: "PROT002", tel1: "11999990001", tel2: "" },
    ];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const dataLine = csv.split(/\r?\n/)[1];
    const cols = dataLine.split(";");
    // Col B (index 1) should contain both protocols merged
    expect(cols[1]).toBe("PROT001 / PROT002");
  });

  it("does NOT deduplicate SMS (same phone can appear multiple times in SMS)", () => {
    const rows = [
      { nome: "Devedor A", doc: "111.111.111-11", Protocolo: "PROT001", tel1: "11999990001", tel2: "" },
      { nome: "Devedor B", doc: "222.222.222-22", Protocolo: "PROT002", tel1: "11999990001", tel2: "" },
    ];
    const result = processData(rows, mapping, headers);
    const smsCsv = result.cpfSmsCsv.toString("utf-8");
    const smsLines = smsCsv.split(/\r?\n/).filter(Boolean);
    // SMS: 1 header + 2 data rows (no deduplication)
    expect(smsLines.length).toBe(3);
  });

  it("keeps distinct phones as separate rows in LIGACAO", () => {
    // Same debtor with 2 different phones → 2 rows (no dedup needed)
    const rows = [
      { nome: "Devedor A", doc: "111.111.111-11", Protocolo: "PROT001", tel1: "11999990001", tel2: "11999990002" },
    ];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const lines = csv.split(/\r?\n/).filter(Boolean);
    // 1 header + 2 data rows (2 distinct phones)
    expect(lines.length).toBe(3);
  });

  it("does not duplicate protocol when same phone appears in same row twice (via different tel columns)", () => {
    // tel1 and tel2 are the same number — should produce 1 row, not 2
    const rows = [
      { nome: "Devedor A", doc: "111.111.111-11", Protocolo: "PROT001", tel1: "11999990001", tel2: "11999990001" },
    ];
    const result = processData(rows, mapping, headers);
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const lines = csv.split(/\r?\n/).filter(Boolean);
    // 1 header + 1 deduplicated row
    expect(lines.length).toBe(2);
    // Protocol should appear only once (not duplicated)
    const dataLine = csv.split(/\r?\n/)[1];
    expect(dataLine.split(";")[1]).toBe("PROT001");
  });

  it("totalLinhasGeradas reflects pre-dedup count (raw expansions)", () => {
    // 2 rows × 1 phone each = 2 raw expansions, but after dedup → 1 LIGACAO row
    const rows = [
      { nome: "Devedor A", doc: "111.111.111-11", Protocolo: "PROT001", tel1: "11999990001", tel2: "" },
      { nome: "Devedor B", doc: "222.222.222-22", Protocolo: "PROT002", tel1: "11999990001", tel2: "" },
    ];
    const result = processData(rows, mapping, headers);
    // totalLinhasGeradas is the pre-dedup count (2 phones processed)
    expect(result.totalLinhasGeradas).toBe(2);
    // But LIGACAO CSV has only 1 data row
    const csv = result.cpfLigacaoCsv.toString("utf-8");
    const dataRows = csv.split(/\r?\n/).filter(Boolean).length - 1;
    expect(dataRows).toBe(1);
  });
});
