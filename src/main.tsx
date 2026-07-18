import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AdminConsole from './components/AdminConsole.tsx'
import TermsOfService from './components/TermsOfService.tsx'
import PrivacyPolicy from './components/PrivacyPolicy.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.log('ServiceWorker registration failed: ', error);
    });
  });
}

import { createBrowserRouter, RouterProvider } from 'react-router-dom'

const router = createBrowserRouter([
  { path: "/*", element: <App /> },
  { path: "/terms", element: <TermsOfService /> },
  { path: "/privacy", element: <PrivacyPolicy /> },
  { path: "/admin", element: <AdminConsole /> }
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
