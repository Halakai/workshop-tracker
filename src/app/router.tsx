import { lazy } from 'react';
import { createHashRouter } from 'react-router';
import { AppLayout } from './AppLayout';
import { LegacyRedirect, NotFoundPage } from './screens';
import { RequireAdmin, RequireAuth } from '@/features/auth/RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { MorePage } from '@/features/more/MorePage';

// Each area's code loads the first time it's opened (AppLayout shows a placeholder meanwhile),
// so the app starts fast on a phone.
const stock = () => import('@/features/inventory/pages');
const cars = () => import('@/features/cars/pages');
const StockListPage = lazy(() => stock().then((m) => ({ default: m.StockListPage })));
const ItemPage = lazy(() => stock().then((m) => ({ default: m.ItemPage })));
const ItemFormPage = lazy(() => stock().then((m) => ({ default: m.ItemFormPage })));
const ShoppingListPage = lazy(() => stock().then((m) => ({ default: m.ShoppingListPage })));
const tools = () => import('@/features/tools/pages');
const ToolsListPage = lazy(() => tools().then((m) => ({ default: m.ToolsListPage })));
const ToolPage = lazy(() => tools().then((m) => ({ default: m.ToolPage })));
const ToolFormPage = lazy(() => tools().then((m) => ({ default: m.ToolFormPage })));
const CarsListPage = lazy(() => cars().then((m) => ({ default: m.CarsListPage })));
const CarPage = lazy(() => cars().then((m) => ({ default: m.CarPage })));
const CarFormPage = lazy(() => cars().then((m) => ({ default: m.CarFormPage })));
const AccountPage = lazy(() => import('@/features/account/AccountPage').then((m) => ({ default: m.AccountPage })));
const carLists = () => import('@/features/catalog/CarCatalogPages');
const CarMakesPage = lazy(() => carLists().then((m) => ({ default: m.CarMakesPage })));
const CarMakePage = lazy(() => carLists().then((m) => ({ default: m.CarMakePage })));
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
const HomePage = lazy(() => import('@/features/home/HomePage').then((m) => ({ default: m.HomePage })));
const ContactsPage = lazy(() => import('@/features/contacts/ContactsPage').then((m) => ({ default: m.ContactsPage })));
const ExportPage = lazy(() => import('@/features/export/ExportPage').then((m) => ({ default: m.ExportPage })));
const SearchPage = lazy(() => import('@/features/search/SearchPage').then((m) => ({ default: m.SearchPage })));
const UsersPage = lazy(() => import('@/features/users/UsersPage').then((m) => ({ default: m.UsersPage })));
const website = () => import('@/features/website/pages');
const WebsitePage = lazy(() => website().then((m) => ({ default: m.WebsitePage })));
const CarWebsitePage = lazy(() => website().then((m) => ({ default: m.CarWebsitePage })));
const JobWebsitePage = lazy(() => website().then((m) => ({ default: m.JobWebsitePage })));

// HashRouter: URLs look like …/workshop-tracker/app/#/cars/123, which always works on GitHub Pages.
export const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'inventory', element: <StockListPage /> },
          { path: 'inventory/new', element: <ItemFormPage /> },
          { path: 'inventory/shopping-list', element: <ShoppingListPage /> },
          // tools live under inventory, so the Inventory tab stays highlighted
          { path: 'inventory/tools', element: <ToolsListPage /> },
          { path: 'inventory/tools/new', element: <ToolFormPage /> },
          { path: 'inventory/tools/:id', element: <ToolPage /> },
          { path: 'inventory/tools/:id/edit', element: <ToolFormPage /> },
          { path: 'inventory/:id', element: <ItemPage /> },
          { path: 'inventory/:id/edit', element: <ItemFormPage /> },
          // old links and bookmarks (the section used to be called Stock)
          { path: 'stock/*', element: <LegacyRedirect from="/stock" to="/inventory" /> },
          { path: 'cars', element: <CarsListPage /> },
          { path: 'cars/new', element: <CarFormPage /> },
          { path: 'cars/:id', element: <CarPage /> },
          { path: 'cars/:id/edit', element: <CarFormPage /> },
          { path: 'cars/:id/settle', element: <SettlePage /> },
          { path: 'cars/:id/website', element: <CarWebsitePage /> },
          { path: 'money', element: <MoneyPage /> },
          { path: 'partners', element: <PartnersPage /> },
          { path: 'partners/:id', element: <PartnerPage /> },
          { path: 'jobs', element: <JobsListPage /> },
          { path: 'jobs/new', element: <JobFormPage /> },
          { path: 'jobs/:id', element: <JobPage /> },
          { path: 'jobs/:id/edit', element: <JobFormPage /> },
          { path: 'jobs/:id/settle', element: <JobSettlePage /> },
          { path: 'jobs/:id/website', element: <JobWebsitePage /> },
          { path: 'website', element: <WebsitePage /> },
          { path: 'more', element: <MorePage /> },
          { path: 'account', element: <AccountPage /> },
          { path: 'lists', element: <ListsPage /> },
          { path: 'lists/cars', element: <CarMakesPage /> },
          { path: 'lists/cars/:id', element: <CarMakePage /> },
          { path: 'contacts', element: <ContactsPage /> },
          {
            element: <RequireAdmin />,
            children: [
              { path: 'users', element: <UsersPage /> },
              { path: 'settings', element: <SettingsPage /> },
              { path: 'export', element: <ExportPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
