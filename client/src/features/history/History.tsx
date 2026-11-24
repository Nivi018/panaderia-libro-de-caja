import { historyQuerySchema, monthRange, shifts } from "@panaderia/domain";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { useState, type FormEvent } from "react";
import { create } from "zustand";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mxn, shiftName } from "../capture/format";
import { cutQuery, failure, ledgers, todayQuery } from "../capture/queries";

type Filters = z.infer<typeof historyQuerySchema>;
type Draft = { mode: "month" | "range"; month: string; from: string; to: string; shift: NonNullable<Filters["shift"]> | ""; status: NonNullable<Filters["status"]> | "" };
const useHistoryFilters = create<{ applied: Filters; apply: (applied: Filters) => void }>((set) => ({
  applied: {}, apply: (applied) => set({ applied }),
}));
const shortDate = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" });
const showDate = (date: string) => shortDate.format(new Date(`${date}T12:00:00Z`));
const money = (value: string | null | undefined) => value == null ? "—" : mxn(value);

const listQuery = (query: Filters) => queryOptions({
  queryKey: ["ledgers", "history", query],
  queryFn: async ({ signal }) => {
    const res = await ledgers.$get({ query }, { init: { signal } });
    if (res.status !== 200) throw failure(res.status, await res.json());
    return res.json();
  },
});
function summaryQuery({ month, from, to, shift }: Filters) {
  const query = { month, from, to, shift };
  return queryOptions({
    queryKey: ["ledgers", "summary", query],
    queryFn: async ({ signal }) => {
      const res = await ledgers.summary.$get({ query }, { init: { signal } });
      if (res.status !== 200) throw failure(res.status, await res.json());
      return res.json();
    },
  });
}

export function HistoryPage() {
  const current = useQuery(todayQuery);
  return <div className="history">
    <div className="page-head"><div><h1>Historial de caja</h1><p className="date">Consulta y descarga los cortes por periodo.</p></div></div>
    {current.isPending ? <p role="status" className="notice">Cargando historial…</p> :
      current.isError ? <Retry retry={() => void current.refetch()} /> : <History businessMonth={current.data.date.slice(0, 7)} />}
  </div>;
}

function Retry({ retry }: { retry: () => void }) {
  return <div className="notice error"><p role="alert">No pudimos cargar los cortes.</p>
    <Button variant="outline" onClick={retry}>Reintentar</Button></div>;
}

function History({ businessMonth }: { businessMonth: string }) {
  const cache = useQueryClient();
  const applied = useHistoryFilters((state) => state.applied);
  const apply = useHistoryFilters((state) => state.apply);
  const effective = applied.month || applied.from ? applied : { ...applied, month: businessMonth };
  const [draft, setDraft] = useState<Draft>(() => ({
    mode: effective.from ? "range" : "month", month: effective.month ?? businessMonth,
    from: effective.from ?? monthRange(businessMonth).from, to: effective.to ?? monthRange(businessMonth).to,
    shift: effective.shift ?? "", status: effective.status ?? "",
  }));
  const [filterError, setFilterError] = useState("");
  const [downloadStatus, setDownloadStatus] = useState("");
  const list = useQuery(listQuery(effective));
  const totals = useQuery(summaryQuery(effective));
  const data = list.data;
  const rows = data?.rows ?? [];
  const download = useMutation({
    mutationFn: async ({ id, format }: { id: string; format: "pdf" | "xml" }) => {
      setDownloadStatus("");
      const cut = await cache.fetchQuery(cutQuery(id));
      const { downloadLedger } = await import("./exports");
      await downloadLedger(cut, format);
    },
    onSuccess: (_, { format }) => setDownloadStatus(`Descarga ${format.toUpperCase()} iniciada.`),
  });
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));

  function filter(event: FormEvent) {
    event.preventDefault();
    const candidate = historyQuerySchema.safeParse({
      ...(draft.mode === "month" ? { month: draft.month } : { from: draft.from, to: draft.to }),
      ...(draft.shift ? { shift: draft.shift } : {}), ...(draft.status ? { status: draft.status } : {}),
    });
    if (!candidate.success) { setFilterError("Selecciona un mes válido o un rango de hasta 366 días, con inicio anterior o igual al fin."); return; }
    setFilterError("");
    apply(candidate.data);
  }

  function clearFilters() {
    setDraft({ mode: "month", month: businessMonth, ...monthRange(businessMonth), shift: "", status: "" });
    setFilterError("");
    apply({});
  }

  const stats = [
    ["Ingresos del periodo", totals.data?.income],
    ["Egresos del periodo", totals.data?.expenses],
    ["Utilidad de caja", totals.data?.net],
    ["Diferencia acumulada", totals.data?.difference],
  ] as const;
  return <>
    <form className="surface history-filters" onSubmit={filter} noValidate aria-label="Filtros del historial">
      <div className="filter-controls">
        <div><Label htmlFor="period-mode">Periodo</Label><NativeSelect id="period-mode" value={draft.mode} onChange={(event) =>
          update("mode", event.target.value === "range" ? "range" : "month")}><NativeSelectOption value="month">Por mes</NativeSelectOption><NativeSelectOption value="range">Por fechas</NativeSelectOption></NativeSelect></div>
        {draft.mode === "month" ? <div><Label htmlFor="history-month">Mes</Label>
          <Input id="history-month" type="month" value={draft.month} onChange={(event) => update("month", event.target.value)} /></div> :
          <><div><Label htmlFor="history-from">Desde</Label><Input id="history-from" type="date" value={draft.from}
            onChange={(event) => update("from", event.target.value)} /></div>
          <div><Label htmlFor="history-to">Hasta</Label><Input id="history-to" type="date" value={draft.to}
            onChange={(event) => update("to", event.target.value)} /></div></>}
        <div><Label htmlFor="history-shift">Turno</Label><NativeSelect id="history-shift" value={draft.shift} onChange={(event) =>
          update("shift", event.target.value as Draft["shift"])}><NativeSelectOption value="">Todos</NativeSelectOption>
          {shifts.map((shift) => <NativeSelectOption value={shift} key={shift}>{shiftName[shift]}</NativeSelectOption>)}</NativeSelect></div>
        <div><Label htmlFor="history-status">Estado de la tabla</Label><NativeSelect id="history-status" value={draft.status} onChange={(event) =>
          update("status", event.target.value as Draft["status"])}><NativeSelectOption value="">Todos</NativeSelectOption><NativeSelectOption value="abierto">Abiertos</NativeSelectOption>
          <NativeSelectOption value="cerrado">Cerrados</NativeSelectOption></NativeSelect></div>
        <div className="filter-actions"><Button>Aplicar filtros</Button>
          <Button type="button" variant="ghost" onClick={clearFilters}>Restablecer</Button></div>
      </div>
      {filterError && <p className="field-error" role="alert">{filterError}</p>}
    </form>
    <section aria-labelledby="period-summary" className="period-summary">
      <div className="history-heading"><h2 id="period-summary">Resumen del periodo</h2>
        {totals.data && <p>{showDate(totals.data.period.from)} al {showDate(totals.data.period.to)}</p>}</div>
      {totals.isError ? <Retry retry={() => void totals.refetch()} /> :
        <dl className="history-metrics" aria-busy={totals.isPending}>
          {stats.map(([label, amount]) => <div className="surface metric" key={label}><dt>{label}</dt>
            <dd>{totals.isPending ? <span aria-hidden="true" className="metric-placeholder" /> : money(amount)}</dd></div>)}
        </dl>}
      {totals.data && <p className="history-note">
        {totals.data.cuts === 1 ? "1 corte cerrado" : `${totals.data.cuts} cortes cerrados`}. La diferencia suma faltantes y sobrantes.
      </p>}
    </section>
    <section className="surface history-results" aria-labelledby="history-results">
      <div className="section-head"><div><h2 id="history-results">Cortes del periodo</h2>
        <p>{data ? `${data.total} ${data.total === 1 ? "resultado" : "resultados"}` : "Los cortes cerrados se pueden descargar."}</p></div></div>
      {download.isError && <p className="notice error" role="alert">{download.error.message}</p>}
      {downloadStatus && <p className="history-note download-status" role="status">{downloadStatus}</p>}
      {list.isPending ? <p role="status" className="empty">Cargando cortes…</p> :
        list.isError ? <Retry retry={() => void list.refetch()} /> :
        rows.length === 0 ? <div className="empty"><p>No hay cortes con estos filtros.</p><span>Prueba otro periodo o restablece los filtros.</span></div> :
          <Table className="history-table" role="table" aria-labelledby="history-results">
            <TableHeader role="rowgroup"><TableRow role="row"><TableHead scope="col">Fecha y turno</TableHead><TableHead scope="col">Responsable</TableHead><TableHead scope="col">Estado</TableHead>
              <TableHead scope="col" className="number">Ingresos</TableHead><TableHead scope="col" className="number">Egresos</TableHead>
              <TableHead scope="col" className="number">Diferencia</TableHead><TableHead scope="col">Archivos</TableHead></TableRow></TableHeader>
            <TableBody role="rowgroup">{rows.map((row) => {
              const diff = row.summary?.difference;
              const closed = row.status === "cerrado";
              return <TableRow key={row.id} role="row">
                <th scope="row" role="rowheader"><time dateTime={row.date}>{showDate(row.date)}</time><span>{shiftName[row.shift]}</span></th>
                <TableCell role="cell" data-label="Responsable">{row.operator}</TableCell><TableCell role="cell" className="history-state"><Badge variant="secondary" className={`badge ${closed ? "closed" : "open"}`}>{closed ? "Cerrado" : "Abierto"}</Badge></TableCell>
                <TableCell role="cell" className="number" data-label="Ingresos">{money(row.summary?.income)}</TableCell><TableCell role="cell" className="number" data-label="Egresos">{money(row.summary?.expenses)}</TableCell>
                <TableCell role="cell" className="number" data-label="Diferencia">{money(diff)}{diff != null && <span>{diff === "0.00" ? "Cuadra" : diff.startsWith("-") ? "Faltante" : "Sobrante"}</span>}</TableCell>
                <TableCell role="cell" className="export-cell" data-label="Archivos">{closed ? <div className="export-actions">{(["pdf", "xml"] as const).map((format) => <Button key={format} size="sm"
                  variant="outline" disabled={download.isPending}
                  aria-label={`Descargar ${format.toUpperCase()} del ${showDate(row.date)}, turno ${shiftName[row.shift]}`}
                  onClick={() => download.mutate({ id: row.id, format })}>
                  <Download aria-hidden="true" /> {download.isPending && download.variables.id === row.id && download.variables.format === format ? "…" : format.toUpperCase()}
                </Button>)}</div> : <span>No disponible</span>}</TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>}
      {data && data.pages > 1 && <nav className="history-pagination" aria-label="Páginas del historial">
        <Button size="sm" variant="outline" disabled={data.page <= 1 || list.isFetching}
          onClick={() => apply({ ...effective, page: String(data.page - 1) })}><ArrowLeft aria-hidden="true" /> Anterior</Button>
        <span>Página {data.page} de {data.pages}</span>
        <Button size="sm" variant="outline" disabled={data.page >= data.pages || list.isFetching}
          onClick={() => apply({ ...effective, page: String(data.page + 1) })}>Siguiente <ArrowRight aria-hidden="true" /></Button>
      </nav>}
    </section>
  </>;
}
