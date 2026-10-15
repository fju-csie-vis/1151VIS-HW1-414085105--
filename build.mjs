/**
 * Node.js >= 18，無須 npm install。
 * 從相同的 template / CSS / JS 產生可修改版與單檔離線版。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const d3 = require(path.join(root, "vendor/d3.v7.9.0.min.js"));
const read = name => readFile(path.join(root, name), "utf8");
const write = (name, content) => writeFile(path.join(root, name), content, "utf8");
const [template, cssTemplate, chart, rawCsv, library, d3License, fontLicense] = await Promise.all([
  read("src/template.html"), read("src/styles.css"), read("src/chart.js"),
  read("data/population-density-113-original.csv"), read("vendor/d3.v7.9.0.min.js"),
  read("vendor/D3-LICENSE.txt"), read("vendor/FONT-LICENSE.txt")
]);
const fontBytes = await readFile(path.join(root, "vendor/noto-sans-tc-subset.woff2"));
const fontFace = `@font-face { font-family: "Taipei Chart"; src: url(data:font/woff2;base64,${fontBytes.toString("base64")}) format("woff2"); font-style: normal; font-weight: 400 700; font-display: swap; }`;
const styles = cssTemplate.replace("{{FONT_FACE}}", fontFace);

const data = d3.csvParse(rawCsv.replace(/^\uFEFF/, ""))
  .filter(row => row.statistic_yyy === "113" && row.site_id?.startsWith("臺北市"))
  .map(row => ({
    year: 2024, district: row.site_id.slice(3), population: Number(row.people_total),
    area_km2: Number(row.area), density_people_per_km2: Number(row.population_density)
  }))
  .sort((a, b) => d3.descending(a.density_people_per_km2, b.density_people_per_km2));
if (data.length !== 12 || new Set(data.map(d => d.district)).size !== 12) throw new Error("Expected 12 unique Taipei districts.");
for (const d of data) {
  if (![d.population, d.area_km2, d.density_people_per_km2].every(v => Number.isFinite(v) && v > 0)) throw new Error("Invalid numeric data.");
  if (Math.abs(d.population / d.area_km2 - d.density_people_per_km2) > 0.51) throw new Error("Density disagrees with population / area.");
}
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const table = `<table><caption>2024 年臺北市各行政區人口密度（人／平方公里）</caption><thead><tr><th scope="col">行政區</th><th scope="col">人口密度</th></tr></thead><tbody>${data.map(d => `<tr><th scope="row">${escapeHtml(d.district)}</th><td>${d3.format(",.0f")(d.density_people_per_km2)}</td></tr>`).join("")}</tbody></table>`;
const base = template.replace("{{DATA}}", () => rawCsv.replace(/^\uFEFF/, "").replace(/<\/script/gi, "<\\/script"))
  .replace("{{FALLBACK_TABLE}}", () => table);
const inlineScript = source => `<script>\n${source.replace(/<\/script/gi, "<\\/script")}\n</script>`;
await mkdir(path.join(root, "dist"), { recursive: true });
await write("src/styles.generated.css", styles);
await write("index.html", base.replace("{{STYLES}}", '<link rel="stylesheet" href="src/styles.generated.css">')
  .replace("{{D3}}", '<script src="vendor/d3.v7.9.0.min.js"></script>')
  .replace("{{CHART}}", '<script src="src/chart.js"></script>'));
await write("dist/taipei-density-2024.html", base.replace("{{STYLES}}", () => `<style>\n${styles}\n</style>`)
  .replace("{{D3}}", () => inlineScript(`/* D3.js license\n${d3License}\n*/\n${library}`))
  .replace("{{CHART}}", () => inlineScript(chart)) + `\n<!-- Noto Sans TC license\n${fontLicense.replace(/--/g, "—")}\n-->\n`);
await write("data/taipei-density-2024.csv", "\uFEFF" + d3.csvFormat(data) + "\n");
await write("data/taipei-density-2024.json", JSON.stringify(data, null, 2) + "\n");
await write("data/source.json", JSON.stringify({
  title: "各鄉鎮市區人口密度", provider: "內政部戶政司", statisticalYear: 2024, rocYear: 113,
  datasetUrl: "https://data.gov.tw/dataset/8410",
  downloadUrl: "https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/D1450798-F85B-4063-9761-A24B8929A684/resource/F77BA43A-2B6E-4106-839E-10F62F17CF4C/download",
  retrievedOn: "2026-10-13", license: "政府資料開放授權條款第 1 版", licenseUrl: "https://data.gov.tw/license",
  originalSha256: createHash("sha256").update(await readFile(path.join(root,"data/population-density-113-original.csv"))).digest("hex"),
  selection: "statistic_yyy == 113 AND site_id starts with 臺北市; retain all 12 districts",
  densityPolicy: "Use published integer population_density; do not recompute or round a second time."
}, null, 2) + "\n");
console.log(JSON.stringify({ districts: data.length, highest: data[0], lowest: data.at(-1), ratio: data[0].density_people_per_km2 / data.at(-1).density_people_per_km2, d3Version: d3.version }, null, 2));
