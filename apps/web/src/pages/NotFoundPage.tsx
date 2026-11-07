import { Link } from 'react-router';

/** Shown for unknown routes and unknown orders. */
export function NotFoundPage() {
  return (
    <>
      <h1>Not found</h1>
      <p>We can&apos;t find that page.</p>
      <Link to="/" className="page-link">
        Back to orders
      </Link>
    </>
  );
}
