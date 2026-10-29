# Known traps (L3) — read before touching queries or exports

Each entry came from a real incident or a repeated `#agent-miss` review comment.

1. **Unfiltered report queries time out.** Always require `asOfDate` in `ReportFilterSpec`.
2. **Row cap.** Grid pages are capped at 500 rows; exports at 50,000 rows. Above that, return 422
   with code `REPORT_TOO_LARGE`, never truncate silently.
3. **Aspose licence.** Loaded once in `AsposeLicenceConfig`. Loading per request leaks memory.
4. **Time zones.** `as_of_date` is a business date (no time zone). Do not convert it with `ZonedDateTime`.
5. **CIAM cache.** Permission results are cached 60 s. Tests that flip permissions must clear
   `CiamPermissionCache` between steps.
