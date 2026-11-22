// Generate simple flat product illustrations for the demo catalog (public/demo/*.svg).
import { mkdir, writeFile } from "node:fs/promises";

const art = [
  ["tee", "e9e4d8"], ["tee", "2f4a3a"], ["crew", "a4532f"], ["crew", "38383a"], ["tee", "d8c3a0"], ["tee", "f6f5f1"],
  ["cap", "5b6142"], ["cap", "26324a"], ["tote", "e6dcc6"], ["tee", "5f7f95"], ["crew", "a8a7a2"], ["tee", "1f2329"],
];

const dark = (hex) => {
  const n = parseInt(hex, 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 140;
};

const shapes = {
  tee: (c, ink) => `<path d="M300 170 L380 140 Q400 175 440 175 Q480 175 500 140 L580 170 L650 260 L590 300 L560 270 L560 640 L320 640 L320 270 L290 300 L230 260 Z" fill="#${c}" stroke="#0000001a" stroke-width="3"/>
    <path d="M360 400 L410 340 L440 370 L480 320 L530 400 Z" fill="none" stroke="${ink}" stroke-width="8" stroke-linejoin="round"/>`,
  crew: (c, ink) => `<path d="M290 180 L380 145 Q440 185 500 145 L590 180 L670 420 L620 440 L560 290 L560 650 L320 650 L320 290 L260 440 L210 420 Z" fill="#${c}" stroke="#0000001a" stroke-width="3"/>
    <rect x="320" y="620" width="240" height="30" fill="#00000014"/><circle cx="500" cy="270" r="16" fill="none" stroke="${ink}" stroke-width="6"/>`,
  cap: (c, ink) => `<path d="M260 470 Q260 280 440 270 Q620 280 620 470 Z" fill="#${c}" stroke="#0000001a" stroke-width="3"/>
    <path d="M250 470 Q440 440 700 500 Q620 540 440 510 Q330 500 250 490 Z" fill="#${c}" stroke="#00000033" stroke-width="3"/>
    <path d="M400 410 L430 370 L450 390 L480 355 L510 410 Z" fill="${ink}"/>`,
  tote: (c, ink) => `<path d="M360 260 Q360 160 440 160 Q520 160 520 260" fill="none" stroke="#${c}" stroke-width="18"/>
    <path d="M300 250 L580 250 L600 650 L280 650 Z" fill="#${c}" stroke="#0000001a" stroke-width="3"/>
    <circle cx="440" cy="440" r="60" fill="none" stroke="${ink}" stroke-width="8"/>`,
};

await mkdir(new URL("../public/demo/", import.meta.url), { recursive: true });
for (const [kind, hex] of art) {
  const ink = dark(hex) ? "#f3efe6" : "#2a2a28";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 800">${shapes[kind](hex, ink)}</svg>`;
  await writeFile(new URL(`../public/demo/${kind}-${hex}.svg`, import.meta.url), svg);
}
console.log(`wrote ${art.length} demo images`);
