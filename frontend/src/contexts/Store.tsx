import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  isTerminalMode,
  post,
  readPending,
  savePending,
  setCsrf,
  setTimezone,
  setPendingScope,
  setOperationToken,
} from '../services/api';
import { OperationalPin } from '../components/OperationalPin';
import { confirmedOrder, settlePending } from '../services/pending';
import { startPolling } from '../services/polling';
import type { Account, Item, OperationalGrant, Pending, Session, State } from '../types';
interface StoreValue {
  session: Session | null;
  state: State | null;
  loading: boolean;
  busy: boolean;
  error: string;
  notice: string;
  online: boolean;
  pending: Pending[];
  sendingKeys: string[];
  terminal: boolean;
  activeTableId: string;
  operator: OperationalGrant['operator'] | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  enterTable: (id: string) => Promise<void>;
  leaveTable: () => void;
  showPending: () => void;
  command: (action: string, body: Record<string, unknown>) => Promise<unknown>;
  queueOrder: (
    body: Record<string, unknown>,
    preview: Item[],
    commitDraft: () => void,
  ) => Promise<void>;
  retry: (entry: Pending) => Promise<void>;
  rebase: (entry: Pending) => Promise<void>;
  discard: (entry: Pending) => void;
  clear: () => void;
}
const Store = createContext<StoreValue | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const terminal = isTerminalMode();
  const [identity, setIdentity] = useState<Session | null>(null);
  const identityRef = useRef<Session | null>(null);
  const [rawState, setRawState] = useState<State | null>(null);
  const stateRef = useRef<State | null>(null);
  const terminalMap = useRef<State | null>(null);
  const [grant, setGrant] = useState<OperationalGrant | null>(null);
  const grantRef = useRef<OperationalGrant | null>(null);
  const grantTable = useRef('');
  const [activeTableId, setActiveTableId] = useState('');
  const tableRef = useRef('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState<Pending[]>([]);
  const [sendingKeys, setSendingKeys] = useState<string[]>([]);
  const sending = useRef(new Set<string>());
  const sendingTasks = useRef(new Map<string, Promise<void>>());
  const viewRevision = useRef(0);
  const stateRequest = useRef<{
    scope: string;
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const invalidateStateRead = useCallback(() => {
    ++viewRevision.current;
    stateRequest.current?.controller.abort();
    stateRequest.current = null;
  }, []);
  const lock = useRef(false);
  const initialized = useRef(false);
  const [pinRequest, setPinRequest] = useState<{
    tableId: string;
    expected?: string;
    prepare?: () => Promise<void>;
    resolve: (grant: OperationalGrant) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const assignState = useCallback(
    (value: State) => {
      setTimezone(value.timezone);
      stateRef.current = value;
      setRawState(value);
      if (!terminal) localStorage.setItem('baguette.state.v1', JSON.stringify(value));
    },
    [terminal],
  );
  const refresh = useCallback(() => {
    const scope = grantRef.current?.token || identityRef.current?.user.id || 'anonymous';
    if (stateRequest.current?.scope === scope) return stateRequest.current.promise;
    invalidateStateRead();
    const revision = viewRevision.current;
    const controller = new AbortController();
    const promise = post<State>('state', {}, undefined, undefined, controller.signal)
      .then((value) => {
        if (revision !== viewRevision.current) return;
        if (terminal && !grantRef.current) terminalMap.current = value;
        assignState(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) throw error;
      })
      .finally(() => {
        if (stateRequest.current?.controller === controller) stateRequest.current = null;
      });
    stateRequest.current = { scope, controller, promise };
    return promise;
  }, [assignState, terminal, invalidateStateRead]);
  const assignIdentity = (value: Session | null) => {
    identityRef.current = value;
    setIdentity(value);
  };
  const activate = (value: OperationalGrant, tableId: string) => {
    invalidateStateRead();
    setError('');
    setNotice('');
    grantRef.current = value;
    grantTable.current = tableId;
    setGrant(value);
    setOperationToken(value.token);
    tableRef.current = tableId;
    setActiveTableId(tableId);
    if (terminal) {
      setPendingScope(value.operator.id, 'terminal');
      setPending(readPending());
    }
  };
  const askPin = (tableId: string, expected?: string) =>
    new Promise<OperationalGrant>((resolve, reject) =>
      setPinRequest({
        tableId,
        expected,
        resolve,
        reject,
        prepare: sendingTasks.current.size
          ? (() => {
              const submitted = [...sendingTasks.current.values()];
              return () => Promise.allSettled(submitted).then(() => undefined);
            })()
          : undefined,
      }),
    );
  const restore = useCallback(async () => {
    if (location.pathname.startsWith('/carta')) {
      setLoading(false);
      return;
    }
    try {
      setOperationToken('');
      const value = await post<Session>(terminal ? 'auth/terminal' : 'auth/session');
      identityRef.current = value;
      setIdentity(value);
      setCsrf(value.csrf);
      if (!terminal) {
        setPendingScope(value.user.id);
        setPending(readPending());
      } else {
        setPendingScope('anonymous', 'terminal');
        setPending([]);
      }
      await refresh();
    } catch (e) {
      if (terminal) {
        setError(
          'El terminal necesita conexión para iniciar e identificar a cada persona por su PIN.',
        );
      } else if (!(e instanceof ApiError)) {
        try {
          const cached = JSON.parse(
            localStorage.getItem('baguette.state.v1') || 'null',
          ) as State | null;
          if (cached) {
            assignState(cached);
            const value: Session = {
              user: cached.user,
              csrf: '',
              mode: 'management',
            };
            identityRef.current = value;
            setIdentity(value);
            setPendingScope(cached.user.id);
            setPending(readPending());
            setNotice('Vista guardada. Solo podés guardar altas de ítems sin conexión.');
          }
        } catch {
          /* Invalid cache is ignored. */
        }
      }
    } finally {
      setLoading(false);
    }
  }, [assignState, refresh, terminal]);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      void restore();
    }
    const connection = () => setOnline(navigator.onLine);
    const queue = () => setPending(readPending());
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('baguette:pending', queue);
    return () => {
      invalidateStateRead();
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('baguette:pending', queue);
    };
  }, [restore, invalidateStateRead]);
  useEffect(() => {
    if (!identity || !online) return;
    return startPolling(
      async () => {
        try {
          await refresh();
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 401 || lock.current || sending.current.size)
            throw e;
          clearGrant();
          setCsrf('');
          assignIdentity(null);
          if (terminal) {
            await restore();
            if (identityRef.current)
              setNotice(
                'Se renovó la conexión de la terminal. Volvé a entrar con tu PIN; tu borrador sigue guardado.',
              );
          } else {
            setRawState(null);
            stateRef.current = null;
            setPendingScope('anonymous');
            setPending([]);
            localStorage.removeItem('baguette.state.v1');
            setNotice(
              'Tu sesión venció. Iniciá sesión nuevamente; los pendientes siguen guardados.',
            );
          }
        }
      },
      7000,
      document,
    );
  }, [identity, online, refresh, restore, terminal]);
  async function login(username: string, password: string) {
    const value = await post<Session>('auth/login', { username, password });
    if (!['admin', 'cashier'].includes(value.user.role)) {
      setCsrf(value.csrf);
      await post('auth/logout');
      setCsrf('');
      throw new Error(
        'El acceso de gestión está reservado a caja y encargado. Para comandar usá el terminal y tu PIN.',
      );
    }
    setCsrf(value.csrf);
    assignIdentity(value);
    setPendingScope(value.user.id);
    setPending(readPending());
    await refresh();
  }
  function clearGrant() {
    invalidateStateRead();
    grantRef.current = null;
    grantTable.current = '';
    setGrant(null);
    setOperationToken('');
    tableRef.current = '';
    setActiveTableId('');
    if (terminal) {
      setPendingScope('anonymous', 'terminal');
      setPending([]);
      if (terminalMap.current) {
        stateRef.current = terminalMap.current;
        setRawState(terminalMap.current);
      }
    }
  }
  function leaveTable() {
    if (lock.current) {
      setError('Esperá la confirmación de la operación antes de salir de la mesa.');
      return;
    }
    const oldToken = grantRef.current?.token;
    const inFlight = oldToken ? sendingTasks.current.get(oldToken) : undefined;
    const queued = readPending().some(
      (entry) => entry.action === 'order.submit' && entry.table_id === tableRef.current,
    );
    clearGrant();
    if (terminal && oldToken) {
      const release = () =>
        post('auth/operator-release', {}, undefined, oldToken)
          .then(() => undefined)
          .catch(() => undefined);
      // Discard the local grant immediately, but let its submitted request finish before revoking it.
      if (inFlight) void inFlight.then(release, release);
      else void release();
    }
    setNotice(
      inFlight
        ? 'Enviando pedido…'
        : queued
          ? 'Pedido guardado en el dispositivo. Volvé a la mesa con tu PIN para sincronizarlo desde Pendientes.'
          : '',
    );
    void refresh().catch(() => undefined);
  }
  async function enterTable(id: string) {
    if (lock.current) throw new Error('Esperá a que termine la operación actual.');
    setError('');
    setNotice('');
    if (!navigator.onLine)
      throw new Error(
        'Necesitás conexión para identificarte con tu PIN antes de entrar a una mesa.',
      );
    const owner = terminal ? undefined : identityRef.current?.user.id;
    clearGrant();
    const value = await askPin(id, owner);
    if (!terminal && (!owner || identityRef.current?.user.id !== owner))
      throw new Error('La sesión cambió. Volvé a entrar a la mesa con tu PIN.');
    activate(value, id);
    if (terminal) {
      if (value.table_state && stateRef.current) {
        assignState({
          ...stateRef.current,
          ...value.table_state,
          accounts: [
            ...stateRef.current.accounts.filter((a) => a.table_id !== id),
            ...value.table_state.accounts,
          ],
        });
      } else await refresh();
    }
    void recoverSubmittedOrders(id, value);
  }
  async function recoverSubmittedOrders(tableId: string, value: OperationalGrant) {
    const owner = terminal ? value.operator.id : identityRef.current?.user.id;
    if (!owner) return;
    const scope = terminal ? `terminal.${owner}` : owner;
    const entries = readPending(scope).filter(
      (entry) =>
        entry.action === 'order.submit' &&
        entry.table_id === tableId &&
        entry.actor_id === owner &&
        !sending.current.has(entry.key),
    );
    for (const entry of entries) {
      if (grantRef.current?.token !== value.token) return;
      try {
        const lookup = await post<{ found: boolean; result?: unknown }>(
          'operations/lookup',
          { key: entry.key },
          undefined,
          value.token,
        );
        if (!lookup.found) continue;
        const result = confirmedOrder(lookup.result, entry);
        savePending(
          readPending(scope).filter((pending) => pending.key !== entry.key),
          scope,
        );
        if (grantRef.current?.token === value.token && tableRef.current === tableId)
          applyOrderResult(result);
      } catch {
        // An absent or incomplete confirmation must keep the original request for review.
      }
    }
  }
  async function logout() {
    if (terminal) {
      leaveTable();
      return;
    }
    await post('auth/logout');
    clearGrant();
    setCsrf('');
    assignIdentity(null);
    setRawState(null);
    stateRef.current = null;
    setPendingScope('anonymous');
    setPending([]);
    localStorage.removeItem('baguette.state.v1');
  }
  const actorId = () => (terminal ? grantRef.current?.operator.id : identityRef.current?.user.id);
  function assertOwner(entry: Pending) {
    if (terminal && (!grantRef.current || entry.actor_id !== grantRef.current.operator.id))
      throw new Error(
        'Este pendiente requiere el PIN de la persona que lo creó. No se reenviará con otra identidad.',
      );
    if (!terminal && entry.actor_id && entry.actor_id !== identityRef.current?.user.id)
      throw new Error('Este pendiente pertenece a otro usuario.');
  }
  async function operationPost<T>(
    path: string,
    body: unknown,
    key: string | undefined,
    entry: Pending,
  ): Promise<T> {
    assertOwner(entry);
    try {
      return await post<T>(path, body, key);
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'PIN_REQUIRED') throw e;
      const target = String(
        (e.details as { table_id?: string } | undefined)?.table_id ||
          entry.table_id ||
          tableRef.current,
      );
      if (!target) throw e;
      setOperationToken('');
      grantRef.current = null;
      setGrant(null);
      const value = await askPin(target, entry.actor_id);
      // Renewing a management grant must not navigate away from the pending queue.
      activate(value, terminal ? target : tableRef.current);
      return post<T>(path, body, key, value.token);
    }
  }
  async function execute(entry: Pending, retrying = false): Promise<unknown> {
    assertOwner(entry);
    if (!navigator.onLine) {
      if (entry.action !== 'item.add') throw new Error('Esta acción necesita conexión.');
      savePending([...readPending().filter((p) => p.key !== entry.key), entry]);
      setNotice('Ítem guardado como pendiente local. Todavía no es un pedido confirmado.');
      return null;
    }
    if (retrying || entry.state === 'uncertain') {
      const lookup = await operationPost<{ found: boolean; result?: unknown }>(
        'operations/lookup',
        { key: entry.key },
        undefined,
        entry,
      );
      if (lookup.found) {
        return confirmOperation(entry, lookup.result);
      }
      if (entry.replayable === false) {
        savePending(
          readPending().map((p) =>
            p.key === entry.key
              ? {
                  ...p,
                  state: 'failed',
                  error:
                    'La operación no está confirmada. Descartá la solicitud e ingresá nuevamente las credenciales para repetirla.',
                }
              : p,
          ),
        );
        return null;
      }
    }
    const hasSecrets = Object.keys(entry.body).some(
      (k) => k.toLowerCase().includes('password') || k === 'pin' || k === 'authorization',
    );
    const safeEntry: Pending = hasSecrets
      ? {
          ...entry,
          replayable: false,
          body: Object.fromEntries(
            Object.entries(entry.body).filter(
              ([k]) =>
                !k.toLowerCase().includes('password') && k !== 'pin' && k !== 'authorization',
            ),
          ),
        }
      : entry;
    savePending([
      ...readPending().filter((p) => p.key !== entry.key),
      { ...safeEntry, state: 'uncertain' },
    ]);
    let result: { result: unknown };
    try {
      result = await operationPost<{ result: unknown }>(
        `commands/${entry.action}`,
        entry.body,
        entry.key,
        entry,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No pudimos completar la operación.';
      const uncertain = !(e instanceof ApiError) || e.status >= 500;
      savePending([
        ...readPending().filter((p) => p.key !== entry.key),
        {
          ...safeEntry,
          state: uncertain ? 'uncertain' : 'failed',
          error: message,
        },
      ]);
      if (e instanceof ApiError && e.status === 409) {
        invalidateStateRead();
        await refresh().catch(() => undefined);
      }
      throw e;
    }
    return confirmOperation(entry, result.result);
  }
  async function confirmOperation(entry: Pending, result: unknown) {
    invalidateStateRead();
    if (entry.action === 'order.submit') applyOrderResult(confirmedOrder(result, entry));
    savePending(settlePending(readPending(), entry, result));
    setNotice('Guardado.');
    try {
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearGrant();
        setCsrf('');
        assignIdentity(null);
        setRawState(null);
        stateRef.current = null;
        localStorage.removeItem('baguette.state.v1');
        setNotice('La operación se confirmó. Iniciá nuevamente la sesión.');
      } else
        setError(
          'La operación se confirmó, pero falta actualizar la vista. Recuperá la conexión antes de seguir.',
        );
    }
    return result;
  }
  async function command(action: string, body: Record<string, unknown>) {
    if (terminal && !grantRef.current)
      throw new Error('Ingresá a una mesa con tu PIN antes de operar.');
    if (readPending().some((p) => p.action === 'order.submit' && p.table_id === tableRef.current))
      throw new Error(
        'Hay un pedido de esta mesa pendiente de confirmación. Podés seguir armando el próximo pedido; revisá Pendientes antes de modificar la cuenta.',
      );
    if (
      readPending().some(
        (p) =>
          p.state === 'uncertain' && p.action === action && p.body.account_id === body.account_id,
      )
    )
      throw new Error(
        'Hay una operación incierta. Consultá su resultado en Pendientes antes de repetirla.',
      );
    if (lock.current) throw new Error('Hay una operación en curso.');
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      return await execute({
        key: crypto.randomUUID(),
        action,
        body,
        actor_id: actorId(),
        table_id: String(
          body.table_id ||
            stateRef.current?.accounts.find((a) => a.id === body.account_id)?.table_id ||
            tableRef.current,
        ),
        state: 'pending',
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      if (terminal && e instanceof ApiError && e.code === 'PIN_CANCELLED') clearGrant();
      setError(e instanceof Error ? e.message : 'Error de operación.');
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function retry(entry: Pending) {
    if (lock.current || sending.current.has(entry.key)) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (!terminal && identityRef.current?.csrf === '') {
        const value = await post<Session>('auth/session');
        if (value.user.id !== identityRef.current.user.id)
          throw new Error('La sesión cambió. Ingresá con el usuario de esta cola.');
        setCsrf(value.csrf);
        assignIdentity(value);
      }
      await execute(entry, true);
    } catch (e) {
      if (terminal && e instanceof ApiError && e.code === 'PIN_CANCELLED') clearGrant();
      setError(e instanceof Error ? e.message : 'No se pudo sincronizar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function applyOrderResult(result: unknown) {
    const value = result as { account?: Account; items?: Item[] };
    if (!value?.account || !Array.isArray(value.items) || !stateRef.current) return;
    const visible = stateRef.current.accounts.find((a) => a.id === value.account!.id);
    if (visible && visible.version > value.account.version) return;
    invalidateStateRead();
    const ids = new Set(value.items.map((item) => item.id));
    assignState({
      ...stateRef.current,
      accounts: [
        ...stateRef.current.accounts.filter((a) => a.id !== value.account!.id),
        value.account,
      ],
      items: [...stateRef.current.items.filter((item) => !ids.has(item.id)), ...value.items],
    });
  }
  function showOrderMessage(owner: string, tableId: string) {
    if (terminal)
      return tableRef.current
        ? tableRef.current === tableId && grantRef.current?.operator.id === owner
        : Boolean(identityRef.current);
    return (
      identityRef.current?.user.id === owner && (!tableRef.current || tableRef.current === tableId)
    );
  }
  async function queueOrder(
    body: Record<string, unknown>,
    preview: Item[],
    commitDraft: () => void,
  ) {
    const tableId = tableRef.current;
    const owner = actorId();
    if (!owner || body.table_id !== tableId)
      throw new Error('Ingresá a esta mesa con tu PIN antes de enviar.');
    if (lock.current) throw new Error('Esperá a que termine la operación actual.');
    if (!terminal && (!grantRef.current || grantTable.current !== tableId)) {
      if (!navigator.onLine)
        throw new Error('Necesitás conexión para validar tu PIN antes de enviar.');
      lock.current = true;
      setBusy(true);
      try {
        const value = await askPin(tableId, owner);
        if (identityRef.current?.user.id !== owner || tableRef.current !== tableId)
          throw new Error('La sesión o la mesa cambió. Revisá el pedido antes de enviar.');
        activate(value, tableId);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    }
    const operator = grantRef.current;
    if (!operator) throw new Error('Ingresá a esta mesa con tu PIN antes de enviar.');
    const scope = terminal ? `terminal.${owner}` : owner;
    const tableLabel = stateRef.current?.tables.find((t) => t.id === tableRef.current)?.label || '';
    if (readPending(scope).some((p) => p.action === 'order.submit' && p.table_id === body.table_id))
      throw new Error('El pedido anterior todavía no está confirmado. Revisá Pendientes.');
    const entry: Pending = {
      key: crypto.randomUUID(),
      action: 'order.submit',
      body,
      actor_id: owner,
      table_id: tableRef.current,
      preview,
      state: navigator.onLine ? 'uncertain' : 'pending',
      created_at: new Date().toISOString(),
    };
    savePending([...readPending(scope), entry], scope);
    try {
      commitDraft();
    } catch (e) {
      savePending(
        readPending(scope).filter((p) => p.key !== entry.key),
        scope,
      );
      throw e;
    }
    setError('');
    setNotice(
      navigator.onLine
        ? ''
        : 'Pedido guardado en el dispositivo. Sincronizalo desde Pendientes cuando vuelva la conexión.',
    );
    if (!navigator.onLine) return;
    sending.current.add(entry.key);
    setSendingKeys([...sending.current]);
    // Capture both identity and token: navigating to another table cannot change this request's owner.
    const task = post<{ result: unknown }>('commands/order.submit', body, entry.key, operator.token)
      .then(({ result }) => {
        confirmedOrder(result, entry);
        invalidateStateRead();
        if (
          terminal
            ? grantRef.current?.token === operator.token && tableRef.current === entry.table_id
            : identityRef.current?.user.id === owner
        )
          applyOrderResult(result);
        savePending(
          readPending(scope).filter((p) => p.key !== entry.key),
          scope,
        );
        if (showOrderMessage(owner, tableId)) setNotice(`Mesa ${tableLabel}: pedido confirmado.`);
        void refresh().catch(() => undefined);
      })
      .catch((e: unknown) => {
        const uncertain = !(e instanceof ApiError) || e.status >= 500;
        savePending(
          readPending(scope).map((p) =>
            p.key === entry.key
              ? {
                  ...p,
                  state: uncertain ? 'uncertain' : 'failed',
                  error: e instanceof Error ? e.message : 'No se recibió la confirmación.',
                }
              : p,
          ),
          scope,
        );
        if (showOrderMessage(owner, tableId))
          setError(
            `Mesa ${tableLabel}: el pedido sigue en Pendientes. Revisá su resultado antes de volver a enviarlo.`,
          );
      })
      .finally(() => {
        sendingTasks.current.delete(operator.token);
        sending.current.delete(entry.key);
        setSendingKeys([...sending.current]);
      });
    sendingTasks.current.set(operator.token, task);
  }
  async function rebase(entry: Pending) {
    if (
      !['item.add', 'order.submit'].includes(entry.action) ||
      entry.state !== 'failed' ||
      lock.current
    )
      return;
    lock.current = true;
    setBusy(true);
    try {
      assertOwner(entry);
      const lookup = await operationPost<{ found: boolean; result?: unknown }>(
        'operations/lookup',
        { key: entry.key },
        undefined,
        entry,
      );
      if (lookup.found) {
        await confirmOperation(entry, lookup.result);
        return;
      }
      const snapshot = await post<State>('state');
      const candidates = snapshot.accounts.filter(
        (a) => a.table_id === entry.table_id && ['open', 'requested'].includes(a.status),
      );
      const account =
        snapshot.accounts.find((a) => a.id === entry.body.account_id) ||
        (entry.action === 'order.submit' && !entry.body.account_id && candidates.length === 1
          ? candidates[0]
          : undefined);
      if (!account || !['open', 'requested'].includes(account.status))
        throw new Error('La cuenta ya no está disponible. Revisá el pendiente.');
      const replacement: Pending = {
        ...entry,
        key: crypto.randomUUID(),
        state: 'pending',
        error: undefined,
        body: {
          ...entry.body,
          account_id: account.id,
          version: account.version,
        },
      };
      savePending(readPending().map((p) => (p.key === entry.key ? replacement : p)));
      await execute(replacement);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const session = identity && terminal && grant ? { ...identity, user: grant.operator } : identity;
  const state =
    rawState && terminal
      ? {
          ...rawState,
          user: grant?.operator || rawState.user,
          permissions: grant ? ['terminal_view', ...grant.permissions] : ['terminal_view'],
        }
      : rawState;
  return (
    <Store.Provider
      value={{
        session,
        state,
        loading,
        busy,
        error,
        notice,
        online,
        pending,
        sendingKeys,
        terminal,
        activeTableId,
        operator: grant?.operator || null,
        login,
        logout,
        refresh,
        enterTable,
        leaveTable,
        showPending: () => window.dispatchEvent(new Event('baguette:show-pending')),
        command,
        queueOrder,
        retry,
        rebase,
        discard: (entry) => {
          if (entry.state === 'failed') {
            assertOwner(entry);
            savePending(readPending().filter((p) => p.key !== entry.key));
          }
        },
        clear: () => {
          setError('');
          setNotice('');
        },
      }}
    >
      {children}
      {pinRequest && (
        <OperationalPin
          prepare={pinRequest.prepare}
          tableId={pinRequest.tableId}
          label={
            rawState?.tables.find((t) => t.id === pinRequest.tableId)?.label || pinRequest.tableId
          }
          cancel={() => {
            pinRequest.reject(
              new ApiError(403, 'PIN_CANCELLED', 'Operación cancelada: no se validó el PIN.'),
            );
            setPinRequest(null);
          }}
          done={(value) => {
            const operator = value.operator || (!terminal ? identityRef.current?.user : null);
            if (!operator)
              throw new Error('No se recibió una identidad válida. Volvé a ingresar tu PIN.');
            const normalized: OperationalGrant = {
              ...value,
              operator,
              permissions:
                value.permissions ||
                (!terminal && Array.isArray(stateRef.current?.permissions)
                  ? (stateRef.current.permissions as string[])
                  : []),
            };
            if (pinRequest.expected && normalized.operator.id !== pinRequest.expected)
              throw new Error(
                'El pendiente pertenece a otra persona. Ingresá el PIN de quien lo creó.',
              );
            pinRequest.resolve(normalized);
            setPinRequest(null);
          }}
        />
      )}
    </Store.Provider>
  );
}
export function useStore() {
  const value = useContext(Store);
  if (!value) throw new Error('Falta el proveedor de operación.');
  return value;
}
