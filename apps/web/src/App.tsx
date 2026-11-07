import { Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { OrdersListPage } from './pages/OrdersListPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoginPage } from './pages/LoginPage';
import { Shell } from './Shell';

/** The routes; the router (browser or memory) is provided by the caller. */
export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<OrdersListPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
