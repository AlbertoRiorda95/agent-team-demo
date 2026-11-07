import { Link } from 'react-router';
import { pageItems } from '../lib/listState';

/** Previous / page numbers / Next. Hidden when there is a single page. */
export function Pagination({
  page,
  pages,
  hrefFor,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="pagination">
      {page > 1 ? (
        <Link to={hrefFor(page - 1)} className="page-link" rel="prev">
          Previous
        </Link>
      ) : (
        <span className="page-link page-disabled" aria-disabled="true">
          Previous
        </span>
      )}
      <ul>
        {pageItems(page, pages).map((n, i) => (
          <li key={n ?? `gap-${String(i)}`}>
            {n === null ? (
              <span aria-hidden="true">…</span>
            ) : (
              <Link
                to={hrefFor(n)}
                className="page-link"
                aria-label={`Page ${String(n)}`}
                {...(n === page ? { 'aria-current': 'page' as const } : {})}
              >
                {n}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {page < pages ? (
        <Link to={hrefFor(page + 1)} className="page-link" rel="next">
          Next
        </Link>
      ) : (
        <span className="page-link page-disabled" aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}
