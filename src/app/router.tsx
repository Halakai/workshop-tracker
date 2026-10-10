import { createHashRouter } from 'react-router';
import { AppLayout } from './AppLayout';
import { ComingSoonPage, NotFoundPage } from './screens';
import { RequireAdmin, RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { HomePage } from '@/features/home/HomePage';
import { MorePage } from '@/features/more/MorePage';
import { AccountPage } from '@/features/account/AccountPage';
import { UsersPage } from '@/features/users/UsersPage';
import { StockListPage } from '@/features/inventory/StockListPage';
import { ItemPage } from '@/features/inventory/ItemPage';
import { ItemFormPage } from '@/features/inventory/ItemFormPage';
import { ShoppingListPage } from '@/features/inventory/ShoppingListPage';
import { ListsPage } from '@/features/catalog/ListsPage';

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
          { path: 'stock', element: <StockListPage /> },
          { path: 'stock/new', element: <ItemFormPage /> },
          { path: 'stock/shopping-list', element: <ShoppingListPage /> },
          { path: 'stock/:id', element: <ItemPage /> },
          { path: 'stock/:id/edit', element: <ItemFormPage /> },
          { path: 'cars', element: <ComingSoonPage title="Cars" milestone="M3" /> },
          { path: 'jobs', element: <ComingSoonPage title="Jobs" milestone="M5" /> },
          { path: 'more', element: <MorePage /> },
          { path: 'account', element: <AccountPage /> },
          { path: 'lists', element: <ListsPage /> },
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
