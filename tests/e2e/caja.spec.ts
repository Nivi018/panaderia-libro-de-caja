import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("abre, recupera un borrador, guarda, cierra y exporta el turno", async ({ page }, testInfo) => {
  const { CASHIER_EMAIL: email, CASHIER_NAME: name, CASHIER_PASSWORD: password } = process.env;
  if (!email || !name || !password) throw new Error("Falta la credencial temporal.");

  await page.goto("/historial");
  await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("No hay cortes con estos filtros.")).toBeVisible();
  const me = await page.request.get("/api/me");
  expect((await me.json()).role).toBe("cajero");
  await page.getByRole("link", { name: "Captura diaria" }).click();

  await page.getByLabel("Fondo inicial (MXN)").fill("100,00");
  await page.getByRole("button", { name: "Abrir turno" }).click();
  await expect(page.getByText("Turno abierto")).toBeVisible();
  await page.getByRole("button", { name: "Agregar fila" }).click();
  await expect(page.getByRole("combobox", { name: "Tipo, fila 1" })).toBeFocused();
  await page.getByRole("combobox", { name: "Tipo, fila 1" }).press("Enter");
  await expect(page.getByRole("combobox", { name: "Categoría, fila 1" })).toBeFocused();
  await page.getByRole("textbox", { name: "Concepto, fila 1" }).fill('Piñón & <azúcar> "fina"');
  const amount = page.getByRole("textbox", { name: "Importe, fila 1" });
  await amount.fill("12.10");
  await amount.press("Enter");
  await expect(page.getByRole("combobox", { name: "Tipo, fila 2" })).toBeFocused();
  await expect(page.getByText("Cambios sin guardar")).toBeVisible();

  await page.reload();
  await expect(amount).toHaveValue("12.10");
  await page.route("**/api/ledgers/*/entries", (route) => route.fulfill({
    status: 500, json: { code: "INTERNAL_ERROR", message: "No se pudo completar la operación." },
  }), { times: 1 });
  await page.getByRole("button", { name: "Guardar movimientos" }).click();
  await expect(page.getByRole("alert")).toHaveText("No se pudo completar la operación.");
  await expect(amount).toHaveValue("12.10");
  await page.getByRole("button", { name: "Guardar movimientos" }).click();
  await expect(page.getByText("Movimientos guardados.")).toBeVisible();
  await expect(page.getByText("$112.10")).toBeVisible();

  await page.getByLabel("Efectivo contado").fill("111.95");
  await expect(page.getByText("Faltante", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("captura-diaria.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Cerrar turno" }).click();
  const confirm = page.getByRole("button", { name: "Confirmar cierre" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Explicación de la diferencia").fill("Faltaron quince centavos.");
  await confirm.click();
  await expect(page.getByText("Corte cerrado", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar movimientos" })).toHaveCount(0);

  await page.getByRole("link", { name: "Historial" }).click();
  await page.getByLabel("Estado de la tabla").selectOption("cerrado");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.getByText("1 corte cerrado.", { exact: false })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("−$0.15");
  await page.screenshot({ path: testInfo.outputPath("historial.png"), animations: "disabled" });

  const xmlEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar XML/ }).click();
  const xml = await xmlEvent;
  expect(xml.suggestedFilename()).toMatch(/^corte-\d{4}-\d{2}-\d{2}-matutino\.xml$/);
  const xmlPath = testInfo.outputPath("corte.xml");
  await xml.saveAs(xmlPath);
  const contents = await readFile(xmlPath, "utf8");
  const parsed = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, "application/xml");
    return {
      valid: !doc.querySelector("parsererror"), root: doc.documentElement.nodeName,
      concept: doc.querySelector("Concepto")?.textContent, difference: doc.querySelector("DiferenciaArqueo")?.textContent,
      operator: doc.querySelector("Responsable")?.textContent,
    };
  }, contents);
  expect(parsed).toEqual({ valid: true, root: "LibroContable", concept: 'Piñón & <azúcar> "fina"', difference: "-0.15", operator: name });

  const pdfEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar PDF/ }).click();
  const pdf = await pdfEvent;
  expect(pdf.suggestedFilename()).toMatch(/-matutino\.pdf$/);
  const pdfPath = testInfo.outputPath("corte.pdf");
  await pdf.saveAs(pdfPath);
  expect((await readFile(pdfPath)).subarray(0, 5).toString()).toBe("%PDF-");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page.getByRole("heading", { name: "Inicia sesión" })).toBeVisible();
});
