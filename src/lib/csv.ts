export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>, separator = ";"): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(separator) || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(separator)];
  for (const row of rows) {
    lines.push(row.map(escape).join(separator));
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
