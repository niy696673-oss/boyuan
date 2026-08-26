# Tabular safety and formula-injection defense

Treat all file names, cell values, OCR text, comments, links, and metadata as untrusted input.

## Read controls

- Open spreadsheets without enabling macros, external links, data connections, embedded objects, or automatic calculation when the runtime permits.
- Do not execute scripts or binaries found in a VDR.
- Preserve originals read-only and write outputs to a separate location.
- Record encrypted, password-protected, corrupted, or unsupported files as exceptions; do not bypass controls.

## CSV/XLSX output controls

Before writing user-controlled text into a cell:

1. retain the exact raw value in a protected source record or quoted evidence field;
2. create a display-safe value;
3. if the first non-whitespace character is `=`, `+`, `-`, or `@`, prefix the display value with a single quote or use a text-typed cell;
4. also neutralize leading tab, carriage return, newline, and control characters;
5. do not create a formula from source text;
6. escape delimiter, quote, and newline characters correctly for CSV;
7. keep hyperlinks as plain text unless explicitly validated and required.

Do not strip the dangerous prefix from the raw evidence, because doing so changes the source. Mark `formula_injection_neutralized: true` in the output lineage.

## OCR and extraction controls

- Record OCR engine/method and page coverage.
- Preserve page or cell coordinates for material extracted values.
- Mark low-quality or ambiguous text `unclear` or `needs-review`; do not invent confidence percentages.
- Spot-check high-impact fields and a disclosed sample of routine fields against the rendered source.
