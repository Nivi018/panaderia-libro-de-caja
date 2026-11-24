import { categories, captureSchema, closeLedgerSchema, openLedgerSchema, shifts, summarizeLedger } from "@panaderia/domain";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, BookOpen, CircleCheck, Lock, LogOut, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { currentUserQuery } from "@/lib/query";
import { HistoryPage } from "../history/History";
import { categoryName, displayDate, mxn, parseMoney, shiftName } from "./format";
import { CaptureError, cutQuery, failure, ledgers, todayQuery, type Cut, type Today } from "./queries";
import { useCapture, type LocalDraft, type Row } from "./state";

const loginSchema = z.object({ email: z.email("Escribe un correo válido."), password: z.string().min(1, "Escribe tu contraseña.") });
const blank = (): Row => ({ entryId: "", type: "ingreso", category: "pan_dulce", concept: "", amount: "" });
const isPristine = (row: Row) => !row.entryId && row.type === "ingreso" && row.category === "pan_dulce" && !row.concept && !row.amount;
const rowsFrom = (cut: Cut): Row[] => cut.entries.map(({ id: entryId, type, category, concept, amount }) =>
  ({ entryId, type, category, concept, amount }));

export function Capture() {
  const cache = useQueryClient();
  const me = useQuery(currentUserQuery);
  const select = useCapture((state) => state.select);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const isHistory = window.location.pathname.replace(/\/$/, "") === "/historial";

  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      select(null);
      cache.removeQueries({ queryKey: ["ledgers"] });
      cache.setQueryData(currentUserQuery.queryKey, null);
    } catch {
      setSignOutError("No pudimos cerrar la sesión. Intenta de nuevo.");
    } finally { setSigningOut(false); }
  }

  return <>
    <a className="skip" href="#main">Saltar al contenido</a>
    <header className="topbar">
      <div className="shell bar-content">
        <span className="brand"><BookOpen aria-hidden="true" size={21} /> Libro de caja</span>
        {me.data && <nav aria-label="Libro de caja" className="book-nav">
          <a href="/" aria-current={!isHistory ? "page" : undefined}>Captura diaria</a>
          <a href="/historial" aria-current={isHistory ? "page" : undefined}>Historial</a>
        </nav>}
        {me.data && <div className="account">
          <span>{me.data.name}</span>
          <Button className="top-action" variant="ghost" onClick={() => void signOut()} disabled={signingOut}>
            <LogOut aria-hidden="true" /> Salir
          </Button>
        </div>}
      </div>
    </header>
    <main id="main" className="shell">
      {signOutError && <p className="notice error" role="alert">{signOutError}</p>}
      {me.isPending ? <p className="notice" role="status">Comprobando sesión…</p> :
        me.isError ? <LoadError retry={() => void me.refetch()} /> :
        me.data ? isHistory ? <HistoryPage /> : <Workspace key={me.data.id} userId={me.data.id} /> : <Login />}
    </main>
  </>;
}

function LoadError({ retry }: { retry: () => void }) {
  return <div className="notice error"><p role="alert">No pudimos cargar los datos. Revisa tu conexión.</p>
    <Button type="button" variant="outline" onClick={retry}>Reintentar</Button></div>;
}

function Login() {
  const cache = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" },
  });
  const [error, setError] = useState("");
  return <section className="entry-panel" aria-labelledby="login-title">
    <h1 id="login-title">Inicia sesión</h1>
    <p>Usa tu cuenta para registrar los movimientos del turno.</p>
    <form className="stack" onSubmit={handleSubmit(async (data) => {
      setError("");
      try {
        const result = await authClient.signIn.email(data);
        if (result.error) { setError("No pudimos iniciar sesión. Revisa tu correo y contraseña."); return; }
        await cache.invalidateQueries({ queryKey: currentUserQuery.queryKey });
      } catch { setError("No pudimos conectar. Intenta de nuevo."); }
    })} noValidate>
      <div><Label htmlFor="email">Correo electrónico</Label><Input id="email" type="email" autoComplete="username"
        aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} {...register("email")} />
        {errors.email && <p className="field-error" id="email-error">{errors.email.message}</p>}</div>
      <div><Label htmlFor="password">Contraseña</Label><Input id="password" type="password" autoComplete="current-password"
        aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : undefined} {...register("password")} />
        {errors.password && <p className="field-error" id="password-error">{errors.password.message}</p>}</div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <Button disabled={isSubmitting}>{isSubmitting ? "Entrando…" : "Entrar"}</Button>
    </form>
  </section>;
}

function Workspace({ userId }: { userId: string }) {
  const today = useQuery(todayQuery);
  const selected = useCapture((state) => state.selected);
  const select = useCapture((state) => state.select);
  const [choosing, setChoosing] = useState(false);
  const own = today.data?.cuts.filter((cut) => cut.mine && cut.status === "abierto") ?? [];
  const id = selected ?? (!choosing && own.length === 1 ? own[0]?.id : undefined);
  const current = useQuery({ ...cutQuery(id ?? ""), enabled: Boolean(id) });
  if (today.isPending) return <p className="notice" role="status">Cargando el turno de hoy…</p>;
  if (today.isError) return <LoadError retry={() => void today.refetch()} />;

  return <>
    <div className="page-head">
      <div><h1>Captura diaria</h1><p className="date">{displayDate(today.data.date)} <span>· {today.data.bakeryName}</span></p></div>
      {id && <Button variant="outline" onClick={() => { setChoosing(true); select(null); }}>Cambiar turno</Button>}
    </div>
    {id ? current.isPending ? <p className="notice" role="status">Cargando movimientos…</p> :
      current.isError ? <LoadError retry={() => void current.refetch()} /> :
        <Editor key={id} cut={current.data} draftKey={`${userId}:${id}`} /> : <ShiftPicker today={today.data} />}
  </>;
}

function ShiftPicker({ today }: { today: Today }) {
  const cache = useQueryClient();
  const select = useCapture((state) => state.select);
  const available = shifts.filter((shift) => !today.cuts.some((cut) => cut.shift === shift));
  const [shift, setShift] = useState<(typeof shifts)[number] | "">("");
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");
  const open = useMutation({
    mutationFn: async (json: z.infer<typeof openLedgerSchema>) => {
      const res = await ledgers.$post({ json });
      if (res.status !== 201) throw failure(res.status, await res.json());
      return res.json();
    },
    onSuccess: (data) => {
      cache.setQueryData(cutQuery(data.ledger.id).queryKey, data);
      select(data.ledger.id);
      void cache.invalidateQueries({ queryKey: ["ledgers", "history"] });
      void cache.invalidateQueries({ queryKey: todayQuery.queryKey });
    },
    onError: (error) => {
      setError(error.message);
      if (error instanceof CaptureError && error.status === 409) void cache.invalidateQueries({ queryKey: todayQuery.queryKey });
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const chosen = available.find((item) => item === shift) ?? available[0];
    const data = openLedgerSchema.safeParse({ shift: chosen, openingBalance: parseMoney(opening) });
    if (!data.success) { setError("Elige un turno disponible y escribe un fondo inicial válido."); return; }
    open.mutate(data.data);
  }
  return <div className="workspace picker">
    <section className="entry-panel">
      <h2>Abrir turno</h2>
      {available.length ? <form className="stack" onSubmit={submit}>
        <div><Label htmlFor="shift">Turno</Label><NativeSelect id="shift" value={available.includes(shift as (typeof shifts)[number]) ? shift : available[0]}
          onChange={(event) => setShift(event.target.value as typeof shift)}>{available.map((item) => <NativeSelectOption key={item} value={item}>{shiftName[item]}</NativeSelectOption>)}</NativeSelect></div>
        <div><Label htmlFor="opening">Fondo inicial (MXN)</Label><Input id="opening" inputMode="decimal" placeholder="0.00" value={opening}
          onChange={(event) => setOpening(event.target.value)} /></div>
        {error && <p className="notice error" role="alert">{error}</p>}
        <Button disabled={open.isPending}>{open.isPending ? "Abriendo…" : "Abrir turno"}</Button>
      </form> : <p>Ya se registraron todos los turnos de hoy.</p>}
    </section>
    <section className="entry-panel">
      <h2>Turnos de hoy</h2>
      {today.cuts.length ? <ul className="shift-list">{today.cuts.map((cut) =>
        <li key={cut.id}><div><strong>{shiftName[cut.shift]}</strong>
          <span>{cut.status === "cerrado" ? "Cerrado" : cut.editable ? "Abierto" : "Abierto por otro cajero"}</span></div>
          {(cut.editable || cut.status === "cerrado") && <Button variant="outline" onClick={() => select(cut.id)}>
            {cut.status === "cerrado" ? "Consultar" : "Retomar"} <span className="sr-only">{shiftName[cut.shift]}</span>
          </Button>}</li>)}</ul> : <p>Todavía no hay cortes para hoy.</p>}
    </section>
  </div>;
}

function Editor({ cut, draftKey }: { cut: Cut; draftKey: string }) {
  const key = cutQuery(cut.ledger.id).queryKey;
  const cache = useQueryClient();
  const [initial] = useState<LocalDraft>(() => useCapture.getState().drafts[draftKey] ?? {
    version: cut.ledger.version, rows: rowsFrom(cut),
  });
  const [base, setBase] = useState(initial.version);
  const [baseline, setBaseline] = useState(() => JSON.stringify(rowsFrom(cut)));
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [closeError, setCloseError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [count, setCount] = useState("");
  const [explanation, setExplanation] = useState("");
  const [closing, setClosing] = useState(false);
  const [reloading, setReloading] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeConfirm = useRef<HTMLFormElement>(null);
  const { register, control, getValues, setValue, setFocus, reset } = useForm<{ rows: Row[] }>({
    defaultValues: { rows: initial.rows },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "rows" });
  const rows = useWatch({ control, name: "rows" });
  const dirty = JSON.stringify(rows.filter((row) => !isPristine(row))) !== baseline;
  const currentVersion = cut.ledger.version;
  const isClosed = cut.ledger.status === "cerrado";
  const stale = (dirty && base !== currentVersion) || conflict;

  useEffect(() => {
    if (closing) closeConfirm.current?.focus();
  }, [closing]);

  useEffect(() => {
    if (!dirty || isClosed) return;
    useCapture.getState().write(draftKey, { version: base, rows });
  }, [dirty, draftKey, base, isClosed, rows]);

  function adopt(data: Cut) {
    const clean = rowsFrom(data);
    setBase(data.ledger.version);
    setBaseline(JSON.stringify(clean));
    reset({ rows: clean });
    setConflict(false);
    setFieldError("");
    useCapture.getState().clear(draftKey);
  }

  useEffect(() => {
    if (!dirty && !conflict && base !== currentVersion) {
      // Refetches can update an untouched form, but never rewrite a local draft.
      reset({ rows: rowsFrom(cut) });
      setBaseline(JSON.stringify(rowsFrom(cut)));
      setBase(currentVersion);
    }
  }, [base, conflict, currentVersion, cut, dirty, reset]);

  const onFailure = (error: Error) => {
    setMessage("");
    setFieldError(error.message);
    if (error instanceof CaptureError && error.status === 409) {
      setConflict(true);
      void cache.invalidateQueries({ queryKey: key });
    }
  };
  const save = useMutation({
    mutationFn: async (json: z.infer<typeof captureSchema>) => {
      const res = await ledgers[":id"].entries.$put({ param: { id: cut.ledger.id }, json });
      if (res.status !== 200) throw failure(res.status, await res.json());
      return res.json();
    },
    onMutate: async (input) => {
      await cache.cancelQueries({ queryKey: key });
      const previous = cache.getQueryData<Cut>(key);
      if (previous) {
        const stamp = new Date().toISOString();
        cache.setQueryData<Cut>(key, {
          ...previous,
          entries: input.entries.map((entry, position) => ({
            ...entry, id: entry.id ?? crypto.randomUUID(), ledgerId: previous.ledger.id, createdAt: stamp, position,
          })),
          summary: summarizeLedger(previous.ledger.openingBalance, previous.ledger.physicalCashCount, input.entries),
        });
      }
      return { previous };
    },
    onError: (error, _input, snapshot) => {
      if (snapshot?.previous) cache.setQueryData(key, snapshot.previous);
      onFailure(error);
    },
    onSuccess: (data) => {
      cache.setQueryData(key, data);
      adopt(data);
      setMessage("Movimientos guardados.");
      void cache.invalidateQueries({ queryKey: todayQuery.queryKey });
    },
  });
  const close = useMutation({
    mutationFn: async (json: z.infer<typeof closeLedgerSchema>) => {
      const res = await ledgers[":id"].close.$post({ param: { id: cut.ledger.id }, json });
      if (res.status !== 200) throw failure(res.status, await res.json());
      return res.json();
    },
    onError: (error) => {
      setCloseError(error.message);
      if (error instanceof CaptureError && error.status === 409) {
        setConflict(true);
        void cache.invalidateQueries({ queryKey: key });
      }
    },
    onSuccess: (data) => {
      cache.setQueryData(key, data);
      adopt(data);
      setClosing(false);
      setMessage("Corte cerrado. Ya no se puede editar.");
      useCapture.getState().select(data.ledger.id);
      void cache.invalidateQueries({ queryKey: ["ledgers", "history"] });
      void cache.invalidateQueries({ queryKey: ["ledgers", "summary"] });
      void cache.invalidateQueries({ queryKey: todayQuery.queryKey });
    },
  });
  const busy = save.isPending || close.isPending;
  const canEdit = !isClosed && !busy && !closing;
  const parsedCount = isClosed ? cut.ledger.physicalCashCount : parseMoney(count);
  const summary = isClosed ? cut.summary : summarizeLedger(cut.ledger.openingBalance, parsedCount,
    rows.flatMap(({ type, amount }) => {
      const parsed = parseMoney(amount);
      return parsed ? [{ type, amount: parsed }] : [];
    }));
  const difference = summary.difference;
  const delta = difference === null ? "Sin conteo" : difference === "0.00" ? "Cuadra" :
    difference.startsWith("-") ? "Faltante" : "Sobrante";

  function submitRows(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || stale || !dirty) return;
    setMessage("");
    const edited = getValues("rows").map((row, index) => ({ row, index })).filter(({ row }) => !isPristine(row));
    const payload = captureSchema.safeParse({
      version: base,
      entries: edited.map(({ row: { entryId, amount, concept, ...row } }) => ({
        ...row, concept: concept.trim() || (row.type === "ingreso" ? categoryName[row.category] : ""),
        ...(entryId ? { id: entryId } : {}), amount: parseMoney(amount),
      })),
    });
    if (!payload.success) {
      const issue = payload.error.issues[0];
      const rowIndex = issue?.path[1];
      const index = typeof rowIndex === "number" ? edited[rowIndex]?.index : undefined;
      const field = issue?.path[2];
      setFieldError(typeof index === "number" ? `Fila ${index + 1}: ${field === "concept" ? "escribe un concepto válido." :
        field === "amount" ? "escribe un importe mayor a cero, con hasta dos decimales." : "revisa la categoría."}` : "El corte admite hasta 500 movimientos.");
      if (typeof index === "number" && (field === "amount" || field === "concept" || field === "category")) setFocus(`rows.${index}.${field}`);
      return;
    }
    setFieldError("");
    save.mutate(payload.data);
  }

  function enter(event: KeyboardEvent, index: number, field: "type" | "category" | "concept" | "amount") {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || !canEdit) return;
    event.preventDefault();
    const next = { type: "category", category: "concept", concept: "amount", amount: null } as const;
    const cell = next[field];
    if (cell) { setFocus(`rows.${index}.${cell}`); return; }
    const row = getValues(`rows.${index}`);
    const amount = parseMoney(row.amount);
    if (!amount || amount === "0.00" || (row.type === "egreso" && !row.concept.trim())) {
      setFieldError(`Fila ${index + 1}: revisa el importe y el concepto antes de continuar.`);
      return;
    }
    setFieldError("");
    if (index + 1 < fields.length) setFocus(`rows.${index + 1}.type`);
    else if (fields.length < 500) append(blank(), { focusName: `rows.${fields.length}.type` });
  }

  function submitClose(event: FormEvent) {
    event.preventDefault();
    if (dirty || stale || busy || isClosed) return;
    const data = closeLedgerSchema.safeParse({ version: base, physicalCashCount: parsedCount, explanation });
    if (!data.success || (difference !== "0.00" && !explanation.trim())) {
      setCloseError("Verifica el conteo y explica cualquier diferencia antes de cerrar.");
      return;
    }
    setCloseError("");
    setMessage("");
    close.mutate(data.data);
  }

  return <div className="workspace">
    <section className="surface entry-sheet" aria-labelledby="movement-title">
      <div className="section-head">
        <div><h2 id="movement-title">Movimientos</h2><p>{shiftName[cut.ledger.shift]} · {rows.length} {rows.length === 1 ? "movimiento" : "movimientos"}</p></div>
        <Badge variant="secondary" className={`badge ${isClosed ? "closed" : "open"}`}>{isClosed ? <Lock size={15} aria-hidden="true" /> : <Banknote size={16} aria-hidden="true" />}{isClosed ? "Corte cerrado" : "Turno abierto"}</Badge>
      </div>
      {stale && <div className="notice error" role="alert">
        <p>El corte cambió en otra sesión. No se sobrescribió tu borrador.</p>
        <details><summary>Ver movimientos guardados</summary><ul>{cut.entries.map((entry) =>
          <li key={entry.id}>{entry.concept} · {mxn(entry.amount)}</li>)}</ul></details>
        {!isClosed && <Button type="button" variant="outline" disabled={busy || reloading}
          onClick={() => {
            if (!window.confirm("¿Descartar este borrador y usar los movimientos guardados?")) return;
            setReloading(true);
            void cache.fetchQuery({ ...cutQuery(cut.ledger.id), staleTime: 0 }).then(adopt, onFailure).finally(() => setReloading(false));
          }}>
          Usar versión guardada
        </Button>}
      </div>}
      {isClosed ? <div className="closed-list">
        {!cut.entries.length && <p>No se registraron movimientos.</p>}
        {cut.entries.map((entry) => <div key={entry.id}><span>{entry.type === "ingreso" ? "Ingreso" : "Egreso"}</span>
          <strong>{entry.concept}</strong><span>{categoryName[entry.category] ?? entry.category}</span>
          <b>{mxn(entry.amount)}</b></div>)}
      </div> : <form onSubmit={submitRows}>
        <div aria-hidden="true" className="movement-labels"><span>Tipo</span><span>Categoría</span><span>Concepto</span><span>Importe (MXN)</span><span /></div>
        {!fields.length && <div className="empty"><p>No hay movimientos en este turno.</p>
          <span>Agrega un total de ventas por categoría o registra un gasto.</span></div>}
        <div className="rows">
          {fields.map((field, index) => {
            const choices = categories[rows[index]?.type ?? "ingreso"];
            const typeField = register(`rows.${index}.type`);
            return <div className="movement-row" key={field.id} role="group" aria-label={`Movimiento ${index + 1}`}>
              <label><span className="mobile-label">Tipo</span><NativeSelect aria-label={`Tipo, fila ${index + 1}`} disabled={!canEdit}
                {...typeField} onChange={(event) => {
                  void typeField.onChange(event);
                  setValue(`rows.${index}.category`, event.target.value === "egreso" ? categories.egreso[0] : categories.ingreso[0]);
                }} onKeyDown={(event) => enter(event, index, "type")}><NativeSelectOption value="ingreso">Ingreso</NativeSelectOption><NativeSelectOption value="egreso">Egreso</NativeSelectOption></NativeSelect></label>
              <label><span className="mobile-label">Categoría</span><NativeSelect aria-label={`Categoría, fila ${index + 1}`} disabled={!canEdit} {...register(`rows.${index}.category`)}
                onKeyDown={(event) => enter(event, index, "category")}>{choices.map((item) => <NativeSelectOption value={item} key={item}>{categoryName[item]}</NativeSelectOption>)}</NativeSelect></label>
              <label><span className="mobile-label">Concepto</span><Input aria-label={`Concepto, fila ${index + 1}`} placeholder={rows[index]?.type === "egreso" ? "Describe el gasto" : "Opcional para ventas"}
                maxLength={200} disabled={!canEdit} {...register(`rows.${index}.concept`)} onKeyDown={(event) => enter(event, index, "concept")} /></label>
              <label><span className="mobile-label">Importe (MXN)</span><Input aria-label={`Importe, fila ${index + 1}`}
                className="amount" inputMode="decimal" placeholder="0.00" maxLength={14} disabled={!canEdit} {...register(`rows.${index}.amount`)}
                onKeyDown={(event) => enter(event, index, "amount")} /></label>
              <Button variant="ghost" size="icon" type="button" aria-label={`Quitar fila ${index + 1}`} disabled={!canEdit}
                onClick={() => remove(index)}><Trash2 aria-hidden="true" size={17} /></Button>
            </div>;
          })}
        </div>
        <div className="sheet-actions">
          <Button type="button" variant="outline" disabled={!canEdit || fields.length >= 500}
            onClick={() => append(blank(), { focusName: `rows.${fields.length}.type` })}><Plus aria-hidden="true" /> Agregar fila</Button>
          <Button disabled={!canEdit || !dirty || stale}>{save.isPending ? "Guardando…" : "Guardar movimientos"}</Button>
        </div>
      </form>}
      <footer className="sheet-footer" aria-live="polite">{message || (dirty && !isClosed ? "Cambios sin guardar" : !isClosed ? "Los cambios guardados se usan en el cierre." : "")}</footer>
      {fieldError && <p className="notice error" role="alert">{fieldError}</p>}
    </section>
    <aside className="surface reconcile" aria-labelledby="reconcile-title">
      <div className="section-head"><div><h2 id="reconcile-title">Arqueo de caja</h2><p>Efectivo en pesos mexicanos</p></div></div>
      <dl className="totals">
        <div><dt>Fondo inicial</dt><dd>{mxn(cut.ledger.openingBalance)}</dd></div>
        <div><dt>Ingresos</dt><dd className="income">{mxn(summary.income)}</dd></div>
        <div><dt>Egresos</dt><dd>{mxn(summary.expenses)}</dd></div>
      </dl>
      <div className="compare">
        <div><span>Efectivo esperado</span><strong>{mxn(summary.balance)}</strong></div>
        <div><Label htmlFor={isClosed ? undefined : "physical-count"}>Efectivo contado</Label>
          {isClosed ? <strong>{parsedCount === null ? "—" : mxn(parsedCount)}</strong> :
            <Input id="physical-count" className="amount" inputMode="decimal" placeholder="0.00" maxLength={14} value={count} disabled={busy || closing}
              aria-invalid={Boolean(count && parsedCount === null)} onChange={(event) => setCount(event.target.value)} />}</div>
      </div>
      {count && parsedCount === null && <p className="field-error">Escribe un conteo con hasta dos decimales.</p>}
      <div className={`balance ${delta === "Cuadra" ? "match" : difference === null ? "" : "different"}`} aria-live="polite">
        <span>{delta === "Cuadra" && <CircleCheck size={16} aria-hidden="true" />}{delta}</span>
        {difference !== null && <strong>{mxn(difference)}</strong>}
      </div>
      {isClosed ? cut.ledger.closingExplanation && <div className="explanation"><strong>Explicación del arqueo</strong><p>{cut.ledger.closingExplanation}</p></div> :
        closing ? <form className="stack close-confirm" onSubmit={submitClose} ref={closeConfirm} tabIndex={-1} aria-label="Confirmar cierre">
          <strong>Confirma el cierre</strong><p>Una vez cerrado, el turno no se podrá editar.</p>
          {closeError && <p className="field-error" role="alert">{closeError}</p>}
          {difference !== "0.00" && <div><Label htmlFor="explanation">Explicación de la diferencia</Label>
            <Textarea id="explanation" rows={3} required maxLength={500} value={explanation} disabled={busy}
              onChange={(event) => setExplanation(event.target.value)} /></div>}
          {dirty && <p>Guarda los cambios antes de confirmar.</p>}
          <div className="close-actions"><Button type="button" variant="outline" disabled={busy}
            onClick={() => { setClosing(false); setCloseError(""); requestAnimationFrame(() => closeButton.current?.focus()); }}>Volver</Button>
            <Button disabled={busy || dirty || stale || (difference !== "0.00" && !explanation.trim())}>
              {close.isPending ? "Cerrando…" : "Confirmar cierre"}</Button></div>
        </form> : <>
          <Button ref={closeButton} className="close-trigger" variant="outline" disabled={busy || dirty || stale || parsedCount === null}
            onClick={() => setClosing(true)}><Lock aria-hidden="true" /> Cerrar turno</Button>
          <p className="close-hint">{dirty ? "Guarda los movimientos antes de cerrar." : "El cierre requiere un conteo de efectivo."}</p>
        </>}
    </aside>
  </div>;
}
