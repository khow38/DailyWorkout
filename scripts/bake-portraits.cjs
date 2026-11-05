const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");

// Capture the actual renderer, not an illustration of the intended result.
// Rebuild before running this command after changing portrait geometry.
async function main() {
  const executablePath = [
    process.env.BROWSER_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find((p) => p && fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 400, height: 400 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root, "index.html")).href);
    await page.addStyleTag({
      content:
        "body{margin:0;padding:0}body>header,body>nav{display:none!important}#app{padding:0!important;margin:0!important;width:400px!important;max-width:none!important}.avatar-stage{width:400px!important;height:400px!important;min-height:0!important}.avatar-view{border:0!important;border-radius:0!important}",
    });
    const portraits = {};
    for (const model of ["male", "female"]) {
      portraits[model] = {};
      for (const id of ["onyx", "lumi", "sion", "aeri"]) {
        await page.evaluate(
          ({ model, id }) => {
            avatarController?.dispose();
            document.querySelector("#app").innerHTML = FormAvatar.markup(
              "squat",
              false,
              "creator",
            );
            avatarController = FormAvatar.mount(
              document.querySelector("[data-avatar]"),
              {
                model,
                appearance: FormAvatar.appearancePreset(id),
              },
            );
          },
          { model, id },
        );
        await page.waitForSelector("[data-ready=true]");
        await page.evaluate(() =>
          document.querySelector("[data-avatar-action=front]").click(),
        );
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const box = await page.locator(".avatar-stage").boundingBox();
        const buffer = await page.screenshot({
          type: "jpeg",
          quality: 87,
          clip: { x: box.x + 80, y: box.y + 75, width: 240, height: 295 },
        });
        portraits[model][id] =
          "data:image/jpeg;base64," + buffer.toString("base64");
      }
    }
    if (errors.length) throw Error(errors.join("\n"));
    fs.writeFileSync(
      path.join(root, "assets/portrait-thumbnails.json"),
      JSON.stringify(portraits) + "\n",
    );
    console.log(
      "Baked 8 portraits from the live male/female renderer. Run npm run build to embed them.",
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
