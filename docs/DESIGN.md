# SIC Live: design

The look is already designed: `reference/mockup/SIC Live - HFI Drogheda.html` is the working mockup (open it in a browser). `reference/mockup/app.css` and `app.js` are its source. Port the visual language; do not copy the code wholesale (the mockup is one file with embedded data).

## Tokens

Put these in `apps/web/src/styles/tokens.css`. Light is the default; dark applies with `prefers-color-scheme: dark` unless `data-theme="light"`, and always on TV screens.

```css
:root {
  --u: 8px; --side-w: 252px; --top-h: 60px; --radius: 12px;
  --font: "Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif;
  --bg:#EEF2F8; --surface:#FFFFFF; --surface-2:#F4F6FA; --surface-3:#E6EBF3; --border:#D5DCE7;
  --text:#0D1A33; --muted:#52607A; --dim:#8592A8; --brand:#002060; --blue:#2F7FD0; --blue-soft:#E1ECFA;
  --g:#2FB36C; --a:#F0AE2A; --r:#E8584A; --n:#8C99AE; --on:#06101F;
  --g-ink:#1D7A46; --a-ink:#9A6205; --r-ink:#B5392C; --g-bg:#E3F3EA; --a-bg:#FBF0DA; --r-bg:#F8E3E0;
  --stop:#D0493B; --gap:#E7A436; --planned:#9AA7BB; --off:#E2E7EF; --write:#A3341C;
  --plan:#7C3AED; --plan-ink:#6D28D9; --plan-bg:#EFE7FD;
  --shadow: 0 1px 2px rgba(13,26,51,.05), 0 2px 10px rgba(13,26,51,.05);
  color-scheme: light;
}
/* dark */
--bg:#050A16; --surface:#0B1530; --surface-2:#101D3B; --surface-3:#172747; --border:#1F2F53;
--text:#FFFFFF; --muted:#AFBBD1; --dim:#6B7A96; --brand:#002060; --blue:#4F9AE6; --blue-soft:#15294B;
--g:#2FC174; --a:#F5B731; --r:#F25A4B; --n:#66758F; --on:#06101F;
--g-ink:#3FD587; --a-ink:#F5B731; --r-ink:#FF7B6C; --g-bg:#10301F; --a-bg:#372A0E; --r-bg:#3B1A17;
--stop:#F25A4B; --gap:#F5B731; --planned:#5F6E87; --off:#1A2542; --write:#F28C72;
--plan:#A78BFA; --plan-ink:#C4B5FD; --plan-bg:#251B45; --shadow:none;
```

## RAG shapes (never colour alone)

| RAG | Shape | Colour token | Text |
| --- | --- | --- | --- |
| G | circle | `--g` | "On target" |
| A | triangle | `--a` | "Close" |
| R | square | `--r` | "Off target" |
| not rated | bar | `--n` | "Not rated" |

CSS from the mockup: `.sh{display:inline-block;width:.72em;height:.72em;background:currentColor}` with `.sh.G{border-radius:50%}`, `.sh.A{clip-path:polygon(50% 4%,96% 92%,4% 92%)}`, `.sh.R{border-radius:12%}`, `.sh.N{clip-path:polygon(0 36%,100% 36%,100% 64%,0 64%)}`.

## Layout

- **Shell:** left navigation (252 px, collapses to 72 px), 60 px top bar with site switcher, date picker, freshness ("Updated 06:42"), notification bell with unread count, theme toggle and the person's name. Navy brand mark (`--brand`).
- **Cards:** `--surface`, 1 px `--border`, `--radius`, `--shadow`; 16 to 24 px padding.
- **Numbers:** tabular figures (`font-variant-numeric: tabular-nums`), thousands separators, units in labels ("packs", "kg", "min").
- **Line SIC grid:** first column 96 px of row labels, then one column per hour (min 26 px), then a totals column. Header row shows hour labels `06`, `07`. The current hour has a `--blue` outline. Red hours with no comment show a small `--write` corner flag and the label "needs comment" for screen readers.
- **Hour drawer:** slides in from the right, 420 px (full screen on phones). Figures at the top, then stops and products, then notes, then the form.
- **Floor screen:** always dark; sizes from `--u`, which the frame sets from its own width (`--u = width / 240`), so it scales to any 16:9 TV. Big numbers (actual v target, attainment, RAG strip for the shift), the worst three lines, "data is N minutes old" banner when stale. No names.

## Copy

- Sentence case, short labels: "Red hours", "Needs comment", "Raise an action", "Acknowledge", "Verified".
- Dates `Mon 2 Nov`, times `06:00`, durations `42 min`, packs `12,480`.
- Empty states say what to do: "No red hours waiting for a comment" or "No actions owned by you".
- Errors say what happened and what to try, using the database message when there is one ("Commenting needs the line leader role or above for this line").
