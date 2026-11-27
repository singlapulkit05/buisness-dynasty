import { useState, useEffect, useCallback } from 'react';

export function parseRoute(pathname = '/') {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';

  if (path === '/' || path === '/dashboard') {
    return { path, name: 'dashboard', tab: 'Home', title: 'Empire Overview', params: {} };
  }
  if (path === '/businesses') {
    return { path, name: 'businesses', tab: 'Business', title: 'Businesses', params: {} };
  }
  if (path === '/businesses/new') {
    return { path, name: 'businesses_new', tab: 'Business', title: 'Start a Business', params: {} };
  }
  if (path === '/businesses/mergers') {
    return { path, name: 'businesses_mergers', tab: 'Business', title: 'Business Mergers', params: {} };
  }
  if (path.startsWith('/businesses/')) {
    const businessId = decodeURIComponent(path.slice('/businesses/'.length));
    return { path, name: 'business_detail', tab: 'Business', title: 'Business Detail', params: { businessId } };
  }
  if (path === '/markets') {
    return { path, name: 'markets', tab: 'Invest', title: 'Markets', params: {} };
  }
  if (path.startsWith('/markets/stocks/')) {
    const symbol = decodeURIComponent(path.slice('/markets/stocks/'.length));
    return { path, name: 'market_detail', tab: 'Invest', title: 'Stock Detail', params: { category: 'stocks', symbol } };
  }
  if (path.startsWith('/markets/crypto/')) {
    const symbol = decodeURIComponent(path.slice('/markets/crypto/'.length));
    return { path, name: 'market_detail', tab: 'Invest', title: 'Crypto Detail', params: { category: 'crypto', symbol } };
  }
  if (path === '/properties') {
    return { path, name: 'properties', tab: 'Property', title: 'Real Estate', params: {} };
  }
  if (path === '/assets') {
    return { path, name: 'assets', tab: 'Assets', title: 'Luxury Assets', params: {} };
  }
  if (path === '/finance') {
    return { path, name: 'finance', tab: 'Home', title: 'Financials & Banking', params: {} };
  }
  if (path === '/empire') {
    return { path, name: 'empire', tab: 'Home', title: 'R&D & Missions', params: {} };
  }
  if (path === '/leaderboard') {
    return { path, name: 'leaderboard', tab: 'Home', title: 'Global Leaderboard', params: {} };
  }
  if (path.startsWith('/players/')) {
    const username = decodeURIComponent(path.slice('/players/'.length));
    return { path, name: 'player_profile', tab: 'Home', title: `${username} — Profile`, params: { username } };
  }
  if (path === '/profile') {
    return { path, name: 'profile', tab: 'Profile', title: 'Player Profile', params: {} };
  }
  if (path === '/feedback') {
    return { path, name: 'feedback', tab: 'Home', title: 'Feedback & Support', params: {} };
  }
  if (path === '/admin/feedback') {
    return { path, name: 'admin_feedback', tab: 'Admin', title: 'Admin Feedback Inbox', params: {} };
  }

  return { path, name: 'not_found', tab: 'Home', title: 'Page Not Found', params: {} };
}

export function useRoute() {
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === to) return;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setPathname(to);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  return { route: parseRoute(pathname), navigate };
}
