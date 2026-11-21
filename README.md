[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Zikri167/makefun-csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Zikri167/makefun-csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)

# csv-reader-speed-01-run-20261121

A faster drop-in for csv-reader 1.0.0: `solve.js` is a dependency-free ES
module whose `run(input)` returns exactly what csv-reader 1.0.0 returns for
every `{text, header}` — `{columns, rows, errors}` — including its whole
broken-row policy (BOM, LF/CRLF, stray CR, quoted fields, `""` escapes,
quote junk, unterminated quotes, short/long rows), only faster.

`main.ts` is the program the harness runs: it reads every case from
`/input/cases.json`, answers each one with `run`, and writes
`/output/answers.json`.

## Speed

On the practice set (6 cases, ~10.5 MB of CSV), the parse alone runs about
4x faster than the reference reader, and the whole program about 2.1x faster
than the house baseline on this machine — same answers, verified case by case
against the reference (`grade-local`: 6/6 cases, passed, reproduced byte for
byte).

## How it is fast

- Plain lines (no quote, no CR) are split natively instead of walked one
  character at a time.
- Fields are sliced, never built up a character at a time.
- Quoted fields are found with `indexOf`, not a per-character walk; only
  fields with doubled quotes or line breaks inside the quotes take the slow
  lane.
- No object is allocated per field.

## License

MIT — see [LICENSE](LICENSE).
