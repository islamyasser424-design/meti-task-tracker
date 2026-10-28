import { createReadStream } from "node:fs";

// Streaming RFC4180 parser; never infer cell types, trim, de-duplicate headers,
// discard unnamed columns, or normalize newlines inside quoted fields.
export async function* csvRows(path, delimiter = ",") {
  let row = [],
    field = "",
    quoted = false,
    closing = false,
    first = true,
    cr = false,
    started = false;
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    for (const ch of chunk) {
      if (first) {
        first = false;
        if (ch === "\ufeff") continue;
      }
      if (cr) {
        cr = false;
        if (ch === "\n") continue;
      }
      if (quoted && !closing) {
        if (ch === '"') closing = true;
        else field += ch;
        if (field.length > 1048576)
          throw new Error("Archive cell limit exceeded");
        continue;
      }
      if (closing) {
        if (ch === '"') {
          field += '"';
          closing = false;
          continue;
        }
        quoted = false;
        closing = false;
        if (ch !== delimiter && ch !== "\r" && ch !== "\n")
          throw new Error("Unexpected character after quote");
      } else if (ch === '"') {
        if (field.length) throw new Error("Unexpected quote in unquoted field");
        quoted = true;
        started = true;
        continue;
      }
      if (ch === delimiter) {
        row.push(field);
        field = "";
        started = true;
      } else if (ch === "\n" || ch === "\r") {
        row.push(field);
        yield row;
        row = [];
        field = "";
        started = false;
        cr = ch === "\r";
      } else {
        field += ch;
        started = true;
      }
      if (field.length > 1048576 || row.length > 100)
        throw new Error("Archive cell or column limit exceeded");
    }
  }
  if (quoted && !closing) throw new Error("Unclosed quoted CSV field");
  if (started || field.length || row.length) {
    row.push(field);
    yield row;
  }
}
