import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const origin = "http://127.0.0.1:15174";
const beat = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function point(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("No se encontró el control en pantalla.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
}

async function click(page: Page, target: Locator) {
  await point(page, target);
  await beat(230);
  await page.mouse.down();
  await beat(100);
  await page.mouse.up();
}

async function write(page: Page, field: Locator, value: string) {
  await click(page, field);
  await field.pressSequentially(value, { delay: 83 });
}

test("graba una demostración real de captura, arqueo y descarga", async ({ browser }, testInfo) => {
  test.setTimeout(95_000);
  const { CASHIER_EMAIL: email, CASHIER_PASSWORD: password } = process.env;
  if (!email || !password) throw new Error("Faltan las credenciales temporales.");

  const context = await browser.newContext({
    baseURL: origin, viewport: { width: 1440, height: 900 }, locale: "es-MX",
    recordVideo: { dir: testInfo.outputPath("raw"), size: { width: 1440, height: 900 } },
  });
  let video;
  try {
    // Authenticate the temporary cashier before opening a recorded tab.
    const login = await context.request.post("/api/auth/sign-in/email", {
      headers: { origin }, data: { email, password },
    });
    expect(login.ok()).toBeTruthy();
    await context.addInitScript(() => {
      // Only the recording gets a visible cursor. No product files or behavior are changed.
      window.addEventListener("DOMContentLoaded", () => {
        const cursor = document.createElement("div");
        cursor.innerHTML = '<svg width="27" height="32" viewBox="0 0 27 32" aria-hidden="true"><path fill="#103c47" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" d="M3 2v23l6-6 4 9 4-2-4-9h9z"/></svg>';
        Object.assign(cursor.style, { position: "fixed", zIndex: "2147483647", pointerEvents: "none", opacity: "0", top: "0", left: "0", filter: "drop-shadow(0 1px 2px #142c3055)" });
        cursor.setAttribute("aria-hidden", "true");
        document.body.append(cursor);
        window.addEventListener("pointermove", (event) => {
          cursor.style.transform = `translate(${event.clientX - 2}px, ${event.clientY - 2}px)`;
          cursor.style.opacity = "1";
        });
        window.addEventListener("pointerdown", (event) => {
          const pulse = document.createElement("div");
          Object.assign(pulse.style, { position: "fixed", zIndex: "2147483646", pointerEvents: "none",
            left: `${event.clientX - 13}px`, top: `${event.clientY - 13}px`, width: "26px", height: "26px",
            border: "3px solid #25859a", borderRadius: "50%" });
          document.body.append(pulse);
          const animation = pulse.animate([{ opacity: 1, transform: "scale(.6)" }, { opacity: 0, transform: "scale(1.65)" }], 410);
          animation.onfinish = () => pulse.remove();
        });
      }, { once: true });
    });

    const page = await context.newPage();
    video = page.video();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Abrir turno" })).toBeVisible();
    await beat(650);
    await write(page, page.getByLabel("Fondo inicial (MXN)"), "450.00");
    await click(page, page.getByRole("button", { name: "Abrir turno" }));
    await expect(page.getByText("Turno abierto")).toBeVisible();
    await beat(550);
    await click(page, page.getByRole("button", { name: "Agregar fila" }));
    const type = (index: number) => page.getByRole("combobox", { name: `Tipo, fila ${index}` });
    const category = (index: number) => page.getByRole("combobox", { name: `Categoría, fila ${index}` });
    const concept = (index: number) => page.getByRole("textbox", { name: `Concepto, fila ${index}` });
    const amount = (index: number) => page.getByRole("textbox", { name: `Importe, fila ${index}` });
    await expect(type(1)).toBeFocused();
    await type(1).press("Enter");
    await expect(category(1)).toBeFocused();
    await category(1).press("Enter");
    await concept(1).pressSequentially("Ventas de mostrador", { delay: 72 });
    await concept(1).press("Enter");
    await amount(1).pressSequentially("785.50", { delay: 105 });
    await amount(1).press("Enter");
    await expect(type(2)).toBeFocused();
    await type(2).selectOption("egreso");
    await category(2).selectOption("proveedores");
    await write(page, concept(2), "Pago de proveedor");
    await concept(2).press("Enter");
    await amount(2).pressSequentially("220.00", { delay: 96 });
    await beat(550);
    await click(page, page.getByRole("button", { name: "Guardar movimientos" }));
    await expect(page.getByText("Movimientos guardados.")).toBeVisible();
    await expect(page.getByText("$1,015.50", { exact: true })).toBeVisible();
    await beat(750);

    await write(page, page.getByLabel("Efectivo contado"), "1015.25");
    await expect(page.getByText("Faltante", { exact: true })).toBeVisible();
    await beat(950);
    await click(page, page.getByRole("button", { name: "Cerrar turno" }));
    const confirmation = page.getByRole("button", { name: "Confirmar cierre" });
    await expect(confirmation).toBeDisabled();
    await write(page, page.getByLabel("Explicación de la diferencia"), "Faltaron 25 centavos.");
    await click(page, confirmation);
    await expect(page.getByText("Corte cerrado", { exact: true })).toBeVisible();
    await beat(950);

    await click(page, page.getByRole("link", { name: "Historial" }));
    await expect(page.getByRole("heading", { name: "Historial de caja" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Cajero de prueba" })).toContainText("−$0.25");
    await beat(850);
    for (const format of ["PDF", "XML"]) {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        click(page, page.getByRole("button", { name: new RegExp(`Descargar ${format}`) })),
      ]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`));
      await expect(page.getByText(`Descarga ${format} iniciada.`)).toBeVisible();
      await beat(850);
    }
  } finally {
    await context.close();
  }
  if (!video) throw new Error("Playwright no generó la grabación.");
  const folder = resolve("video/portfolio/renders");
  await mkdir(folder, { recursive: true });
  await copyFile(await video.path(), resolve(folder, "panaderia-recorrido-original.webm"));
});
