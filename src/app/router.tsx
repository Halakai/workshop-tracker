import { createHashRouter } from 'react-router';
import { AppLayout } from './AppLayout';
import { ComingSoonPage, NotFoundPage } from './screens';
import { RequireAdmin, RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { HomePage } from '@/features/home/HomePage';
import { MorePage } from '@/features/more/MorePage';
import { AccountPage } from '@/features/account/AccountPage';
import { UsersPage } from '@/features/users/UsersPage';

// HashRouter: URLs look like …/workshop-tracker/#/cars/123, which always works on GitHub Pages.
export const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'stock', element: <ComingSoonPage title="Stock" milestone="M2" /> },
          { path: 'cars', element: <ComingSoonPage title="Cars" milestone="M3" /> },
          { path: 'jobs', element: <ComingSoonPage title="Jobs" milestone="M5" /> },
          { path: 'more', element: <MorePage /> },
          { path: 'account', element: <AccountPage /> },
          {
            element: <RequireAdmin />,
            children: [{ path: 'users', element: <UsersPage /> }],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
