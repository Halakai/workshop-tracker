import { lazy } from 'react';
import { createHashRouter } from 'react-router';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './screens';
import { RequireAdmin, RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { HomePage } from '@/features/home/HomePage';
import { MorePage } from '@/features/more/MorePage';

// Each area's code loads the first time it's opened (AppLayout shows a placeholder meanwhile),
// so the app starts fast on a phone.
const stock = () => import('@/features/inventory/pages');
const cars = () => import('@/features/cars/pages');
const StockListPage = lazy(() => stock().then((m) => ({ default: m.StockListPage })));
const ItemPage = lazy(() => stock().then((m) => ({ default: m.ItemPage })));
const ItemFormPage = lazy(() => stock().then((m) => ({ default: m.ItemFormPage })));
const ShoppingListPage = lazy(() => stock().then((m) => ({ default: m.ShoppingListPage })));
const CarsListPage = lazy(() => cars().then((m) => ({ default: m.CarsListPage })));
const CarPage = lazy(() => cars().then((m) => ({ default: m.CarPage })));
const CarFormPage = lazy(() => cars().then((m) => ({ default: m.CarFormPage })));
const AccountPage = lazy(() => import('@/features/account/AccountPage').then((m) => ({ default: m.AccountPage })));
const ListsPage = lazy(() => import('@/features/catalog/ListsPage').then((m) => ({ default: m.ListsPage })));
const money = () => import('@/features/money/pages');
const MoneyPage = lazy(() => money().then((m) => ({ default: m.MoneyPage })));
const PartnersPage = lazy(() => money().then((m) => ({ default: m.PartnersPage })));
const PartnerPage = lazy(() => money().then((m) => ({ default: m.PartnerPage })));
const SettlePage = lazy(() => import('@/features/settlement/SettlePage').then((m) => ({ default: m.SettlePage })));
const jobs = () => import('@/features/jobs/pages');
const JobsListPage = lazy(() => jobs().then((m) => ({ default: m.JobsListPage })));
const JobPage = lazy(() => jobs().then((m) => ({ default: m.JobPage })));
const JobFormPage = lazy(() => jobs().then((m) => ({ default: m.JobFormPage })));
const JobSettlePage = lazy(() => jobs().then((m) => ({ default: m.JobSettlePage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const UsersPage = lazy(() => import('@/features/users/UsersPage').then((m) => ({ default: m.UsersPage })));

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
          { path: 'cars', element: <CarsListPage /> },
          { path: 'cars/new', element: <CarFormPage /> },
          { path: 'cars/:id', element: <CarPage /> },
          { path: 'cars/:id/edit', element: <CarFormPage /> },
          { path: 'cars/:id/settle', element: <SettlePage /> },
          { path: 'money', element: <MoneyPage /> },
          { path: 'partners', element: <PartnersPage /> },
          { path: 'partners/:id', element: <PartnerPage /> },
          { path: 'jobs', element: <JobsListPage /> },
          { path: 'jobs/new', element: <JobFormPage /> },
          { path: 'jobs/:id', element: <JobPage /> },
          { path: 'jobs/:id/edit', element: <JobFormPage /> },
          { path: 'jobs/:id/settle', element: <JobSettlePage /> },
          { path: 'more', element: <MorePage /> },
          { path: 'account', element: <AccountPage /> },
          { path: 'lists', element: <ListsPage /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: 'users', element: <UsersPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
