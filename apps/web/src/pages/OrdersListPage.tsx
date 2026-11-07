import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ErrorRetry } from '../components/ErrorRetry';
import { OrdersResults } from '../components/OrdersResults';
import { Pagination } from '../components/Pagination';
import { Spinner } from '../components/Spinner';
import { buildSearch, parseListState, STATUSES, summary, type ListState } from '../lib/listState';
import { useOrdersList } from './useOrdersList';

const SEARCH_DELAY_MS = 300;
const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `/`: the orders list; status, search and page live in the URL. */
export function OrdersListPage() {
  const [params, setParams] = useSearchParams();
  const state = parseListState(params);
  const { data, retry } = useOrdersList(state);

  const [text, setText] = useState(state.q);
  const committed = useRef(state.q);

  // Back/Forward or a link changed the search: show it, unless it is our own commit
  useEffect(() => {
    if (state.q !== committed.current) {
      committed.current = state.q;
      setText(state.q);
    }
  }, [state.q]);

  // results 300 ms after the last keystroke; typing replaces the entry, no history spam
  useEffect(() => {
    const q = text.trim();
    if (q === committed.current) return;
    const timer = setTimeout(() => {
      committed.current = q;
      setParams(buildSearch({ ...state, q, page: 1 }).slice(1), { replace: true });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // a page beyond the last becomes the last (or none when there are no orders)
  const outOfRange =
    data.status === 'ok' && data.data.items.length === 0 && data.data.total >= 0 && state.page > 1;
  const lastPage =
    data.status === 'ok' ? Math.max(1, Math.ceil(data.data.total / data.data.pageSize)) : 1;
  useEffect(() => {
    if (outOfRange) {
      setParams(buildSearch({ ...state, page: lastPage }).slice(1), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfRange, lastPage]);

  const href = (next: Partial<ListState>) => `/${buildSearch({ ...state, ...next })}`;
  const filtered = state.status !== undefined || state.q !== '';

  let body;
  let count = '';
  if (data.status === 'error') {
    body = <ErrorRetry message="Can't load the orders." onRetry={retry} />;
  } else if (data.status === 'loading' || outOfRange) {
    body = <Spinner label="Loading orders…" />;
  } else if (data.data.total === 0) {
    count = '0 orders';
    body = filtered ? (
      <div className="panel">
        <span>No orders match</span>
        <Link to="/" className="page-link">
          Clear filters
        </Link>
      </div>
    ) : (
      <div className="panel">No orders yet</div>
    );
  } else {
    const { items, page, pageSize, total } = data.data;
    count = summary(page, pageSize, total, items.length);
    body = (
      <>
        <OrdersResults items={items} />
        <Pagination
          page={page}
          pages={Math.ceil(total / pageSize)}
          hrefFor={(n) => href({ page: n })}
        />
      </>
    );
  }

  return (
    <>
      <h1>Orders</h1>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="orders-status">Status</label>
          <select
            id="orders-status"
            value={state.status ?? ''}
            onChange={(e) => {
              const v = parseListState(new URLSearchParams({ status: e.target.value })).status;
              setParams(buildSearch({ ...state, status: v, page: 1 }).slice(1));
            }}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="field field-grow">
          <label htmlFor="orders-search">Search orders</label>
          <input
            id="orders-search"
            type="search"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
        </div>
      </div>
      <section aria-label="Results" aria-busy={data.status === 'loading' || outOfRange}>
        <p className="summary" aria-live="polite">
          {count}
        </p>
        {body}
      </section>
    </>
  );
}
