import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/gate", "/doors"];

test("frontline controls meet the 48 and 96 pixel floors", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  for (const route of ROUTES) {
    await page.goto(route);
    await page.waitForSelector("[data-screen]");
    if (route === "/gate") {
      await page.getByRole("button", { name: "New arrival" }).click();
    }
    const problems = await page.locator("button, a, input, select, [role=button], [role=radio]").evaluateAll((elements) => {
      const visible = elements
        .map((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return { element, box, style };
        })
        .filter(({ element, box, style }) => {
          if (box.width < 2 || box.height < 2) return false;
          if (style.visibility === "hidden" || style.display === "none") return false;
          if (element.closest("nextjs-portal, [data-nextjs-dev-overlay], [data-next-badge-root]")) return false;
          const label = element.getAttribute("aria-label") ?? "";
          if (label.includes("Next.js") || label.includes("issues overlay") || label.includes("issues badge")) return false;
          return true;
        });

      const notes: string[] = [];
      for (const { element, box } of visible) {
        const name = (element.getAttribute("aria-label") || element.textContent || element.tagName).trim().slice(0, 40);
        if (box.height < 48 || box.width < 48) notes.push(`${name} is ${Math.round(box.width)}x${Math.round(box.height)}`);
        if (element.getAttribute("data-primary") != null && box.height < 96) {
          notes.push(`${name} primary is ${Math.round(box.height)}px tall`);
        }
      }

      const sorted = [...visible].sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
      for (let index = 0; index < sorted.length; index += 1) {
        for (let next = index + 1; next < sorted.length; next += 1) {
          const a = sorted[index].box;
          const b = sorted[next].box;
          if (b.top >= a.bottom) break;
          const gap = b.left - a.right;
          if (gap >= 0 && gap < 16) {
            const name = (sorted[index].element.textContent || "").trim().slice(0, 24);
            const other = (sorted[next].element.textContent || "").trim().slice(0, 24);
            notes.push(`${name} and ${other} are ${Math.round(gap)}px apart`);
          }
        }
      }
      return notes;
    });
    expect(problems, route).toEqual([]);
  }
});
