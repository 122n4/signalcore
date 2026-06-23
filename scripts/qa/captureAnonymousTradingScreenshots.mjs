import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.env.SCREENSHOT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const outputDir = path.resolve(process.env.SCREENSHOT_OUTPUT_DIR || "artifacts/anonymous-screenshots");
const headless = process.env.SCREENSHOT_HEADLESS !== "0";

fs.mkdirSync(outputDir, { recursive: true });

function filePath(name) {
  return path.join(outputDir, `${name}.png`);
}

async function anonymizeBrand(page) {
  await page.addStyleTag({
    content: `
      [data-clerk-component],
      .cl-userButtonBox,
      .cl-avatarBox {
        visibility: hidden !important;
      }
    `,
  });

  await page.evaluate(() => {
    const replacements = [
      [/Syntrake/gi, "Trading Desk"],
      [/Signalcore/gi, "Trading Desk"],
      [/Nuno/gi, "User"],
    ];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      let text = node.nodeValue || "";
      for (const [pattern, replacement] of replacements) {
        text = text.replace(pattern, replacement);
      }
      node.nodeValue = text;
    }

    document.title = document.title.replace(/Syntrake|Signalcore/gi, "Trading Desk");
  });
}

async function dismissNoise(page) {
  await page.keyboard.press("Escape").catch(() => null);
  const buttons = [
    /accept/i,
    /close/i,
    /dismiss/i,
    /later/i,
    /not now/i,
    /agora nao/i,
  ];

  for (const pattern of buttons) {
    const button = page.getByRole("button", { name: pattern }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => null);
      await page.waitForTimeout(300);
    }
  }
}

async function openTradingApp(page) {
  await page.context().addCookies([
    {
      name: "syntrake_qa_auth",
      value: "1",
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  await page.goto(`${base}/app?mode=trading&lang=en&__qa_auth=1`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);
  await page.waitForTimeout(2_000);
  await dismissNoise(page);
  await anonymizeBrand(page);
}

async function capture(page, name) {
  await anonymizeBrand(page);
  await page.screenshot({
    path: filePath(name),
    fullPage: false,
    animations: "disabled",
  });
}

async function openInstrumentPlan(page, instruments = ["BTCUSD", "ETHUSD"]) {
  await page.evaluate(() => {
    const showAll = Array.from(document.querySelectorAll("button")).find((button) =>
      /show all/i.test(button.textContent || ""),
    );
    if (showAll instanceof HTMLButtonElement) showAll.click();
  }).catch(() => null);
  await page.waitForTimeout(700);

  for (const instrument of instruments) {
    for (const scrollY of [0, 700, 1400, 2200, 3200, 4600]) {
      await page.evaluate((y) => window.scrollTo(0, y), scrollY).catch(() => null);
      await page.waitForTimeout(250);

      const opened = await page.evaluate((targetInstrument) => {
        const nodes = Array.from(document.querySelectorAll("body *"))
          .filter((node) => (node.textContent || "").includes(targetInstrument))
          .sort((left, right) => (left.textContent || "").length - (right.textContent || "").length);

        for (const label of nodes) {
          let cursor = label;
          for (let depth = 0; cursor && depth < 12; depth += 1) {
            const buttons = Array.from(cursor.querySelectorAll?.("button") ?? []);
            const button = buttons.find((candidate) =>
              /open trade plan/i.test(candidate.textContent || ""),
            );
            if (button instanceof HTMLButtonElement) {
              button.click();
              return true;
            }
            cursor = cursor.parentElement;
          }
        }

        return false;
      }, instrument);

      if (opened) {
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);
        await page.waitForTimeout(1_200);
        await dismissNoise(page);
        await anonymizeBrand(page);
        return instrument;
      }
    }
  }

  const fallbackButton = page.getByRole("button", { name: /open trade plan/i }).first();
  if (await fallbackButton.isVisible().catch(() => false)) {
    await fallbackButton.click();
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => null);
    await page.waitForTimeout(1_200);
    await dismissNoise(page);
    await anonymizeBrand(page);
    return "fallback";
  }

  return null;
}

async function scrollToText(page, pattern) {
  const locator = page.getByText(pattern).first();
  if (await locator.isVisible().catch(() => false)) {
    await locator.scrollIntoViewIfNeeded().catch(() => null);
    await page.waitForTimeout(500);
    await anonymizeBrand(page);
    return true;
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  try {
    await openTradingApp(page);
    await capture(page, "01-market-radar-anonymous");

    await openInstrumentPlan(page);

    await scrollToText(page, /what to do now/i);
    await capture(page, "02-trade-plan-anonymous");

    if (await scrollToText(page, /chart \+ trigger|chart trigger/i)) {
      await capture(page, "03-chart-trigger-anonymous");
    }

    if (await scrollToText(page, /expert trader zone/i)) {
      await capture(page, "03-expert-zone-anonymous");
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/app?mode=trading&lang=en&__qa_auth=1`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => null);
    await page.waitForTimeout(1_500);
    await dismissNoise(page);
    await capture(page, "04-mobile-market-radar-anonymous");

    await browser.close();
    console.log(
      JSON.stringify(
        {
          ok: true,
          outputDir,
          files: fs.readdirSync(outputDir).filter((file) => file.endsWith(".png")),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await browser.close().catch(() => null);
    console.error(error);
    process.exit(1);
  }
}

main();
