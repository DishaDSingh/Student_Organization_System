/**
 * Print artwork as SVG. The template designer works fully offline; AI-generated
 * SVG goes through `sanitizeSvg` and is only ever displayed via <img> (a data
 * URI), where browsers never run scripts or load external resources.
 */

export const TEMPLATE_STYLES = [
  { key: "varsity", label: "Varsity" },
  { key: "badge", label: "Badge" },
  { key: "minimal", label: "Minimal" },
  { key: "stamp", label: "Stamp" },
  { key: "stacked", label: "Stacked" },
] as const;
export type TemplateStyle = (typeof TEMPLATE_STYLES)[number]["key"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function templateArtwork(opts: { style: TemplateStyle; title: string; subtitle?: string; ink: string; accent?: string }) {
  const title = esc(opts.title.trim().slice(0, 28) || "CAMPUSBUZZ");
  const sub = esc((opts.subtitle ?? "").trim().slice(0, 32));
  const ink = /^#[0-9a-f]{6}$/i.test(opts.ink) ? opts.ink : "#ffffff";
  const accent = opts.accent && /^#[0-9a-f]{6}$/i.test(opts.accent) ? opts.accent : ink;
  const font = `font-family="Arial Black, Helvetica, sans-serif" font-weight="900"`;
  const fit = (base: number, len: number, max: number) => Math.max(14, Math.min(base, Math.floor(max / Math.max(1, len) / 0.62)));

  const body = (() => {
    switch (opts.style) {
      case "varsity":
        return `<defs><path id="arc" d="M40 170 A110 110 0 0 1 260 170"/></defs>
<text ${font} font-size="${fit(34, title.length, 300)}" fill="${ink}" letter-spacing="3" text-anchor="middle"><textPath href="#arc" startOffset="50%">${title.toUpperCase()}</textPath></text>
<text ${font} x="150" y="215" font-size="54" fill="${accent}" text-anchor="middle" letter-spacing="2">${esc((opts.subtitle || "26").slice(0, 4))}</text>
<rect x="95" y="232" width="110" height="4" fill="${ink}"/>`;
      case "badge":
        return `<defs><path id="ring" d="M150 150 m-98 0 a98 98 0 1 1 196 0 a98 98 0 1 1 -196 0"/></defs>
<circle cx="150" cy="150" r="118" fill="none" stroke="${ink}" stroke-width="6"/>
<circle cx="150" cy="150" r="80" fill="none" stroke="${ink}" stroke-width="2"/>
<text ${font} font-size="18" fill="${ink}" letter-spacing="4"><textPath href="#ring" startOffset="0">${(title + " • " + (sub || "EST. 2016") + " • ").toUpperCase()}</textPath></text>
<text ${font} x="150" y="164" font-size="${fit(40, Math.min(title.length, 6), 140)}" fill="${accent}" text-anchor="middle">${title
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .slice(0, 4)
          .toUpperCase()}</text>`;
      case "minimal":
        return `<text x="150" y="150" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${fit(36, title.length, 260)}" fill="${ink}" text-anchor="middle" letter-spacing="1">${title}</text>
<rect x="110" y="166" width="80" height="3" fill="${accent}"/>
${sub ? `<text x="150" y="196" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="${ink}" text-anchor="middle" letter-spacing="4">${sub.toUpperCase()}</text>` : ""}`;
      case "stamp":
        return `<g transform="rotate(-8 150 150)">
<rect x="35" y="95" width="230" height="110" rx="12" fill="none" stroke="${ink}" stroke-width="7"/>
<rect x="47" y="107" width="206" height="86" rx="6" fill="none" stroke="${ink}" stroke-width="2"/>
<text ${font} x="150" y="160" font-size="${fit(36, title.length, 190)}" fill="${accent}" text-anchor="middle">${title.toUpperCase()}</text>
${sub ? `<text x="150" y="184" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="13" fill="${ink}" text-anchor="middle" letter-spacing="3">${sub.toUpperCase()}</text>` : ""}</g>`;
      case "stacked": {
        const words = title.toUpperCase().split(/\s+/).slice(0, 3);
        return words
          .map(
            (w, i) =>
              `<text ${font} x="150" y="${110 + i * 52}" font-size="${fit(52, w.length, 240)}" fill="${i % 2 ? accent : ink}" text-anchor="middle">${w}</text>`,
          )
          .join("\n")
          .concat(
            sub
              ? `\n<text x="150" y="${110 + words.length * 52}" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="${ink}" text-anchor="middle" letter-spacing="5">${sub.toUpperCase()}</text>`
              : "",
          );
      }
    }
  })();

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">${body}</svg>`;
}

/**
 * Defence in depth for model-generated SVG. The real safety boundary is that
 * artwork is rendered only through <img>, but we still strip anything active
 * or external before storing it.
 */
export function sanitizeSvg(input: string): string | null {
  let svg = input.trim();
  const start = svg.indexOf("<svg");
  const end = svg.lastIndexOf("</svg>");
  if (start === -1 || end === -1) return null;
  svg = svg.slice(start, end + 6);
  if (svg.length > 60_000) return null;
  svg = svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/?>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/<(iframe|object|embed|image|use|a|style|animate\w*|set)\b[\s\S]*?(\/>|<\/\1\s*>)/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none")
    .replace(/javascript:/gi, "");
  if (!/^<svg[\s>]/i.test(svg)) return null;
  if (!/xmlns=/.test(svg)) svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg;
}

/** For <img src>. Works in browsers and on the server. */
export const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
