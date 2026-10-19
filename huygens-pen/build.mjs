// Wraps app.html into a standalone page for GitHub Pages: docs/huygens-pen/index.html
import { readFileSync, writeFileSync } from "node:fs";
const here = new URL(".", import.meta.url);
const app = readFileSync(new URL("app.html", here), "utf8");
const page = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${app}
</html>
`;
writeFileSync(new URL("../docs/huygens-pen/index.html", here), page);
console.log("wrote docs/huygens-pen/index.html");
