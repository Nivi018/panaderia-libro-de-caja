import { moneySchema } from "@panaderia/domain";

export const shiftName = { matutino: "Matutino", vespertino: "Vespertino", completo: "Completo" };

export function parseMoney(raw: string) {
  const value = raw.trim().replace(",", ".");
  if (!/^\d{1,10}(?:\.\d{0,2})?$/.test(value)) return null;
  const [whole = "", fraction = ""] = value.split(".");
  const result = `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
  return moneySchema.safeParse(result).success ? result : null;
}

export function mxn(value: string) {
  const [whole = "", fraction = "00"] = value.replace(/^-/, "").split(".");
  return `${value.startsWith("-") ? "−" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

export function displayDate(date: string) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export const categoryName: Record<string, string> = {
  pan_dulce: "Pan dulce", pan_blanco: "Pan blanco", pasteleria: "Pastelería", pedidos: "Pedidos",
  insumos_harina_azucar: "Harina y azúcar", gas_servicios: "Gas y servicios", proveedores: "Proveedores",
  nomina: "Nómina", retiro_admin: "Retiro administrativo", otros: "Otros",
};
