import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import SplashScreen from "@/components/SplashScreen";
import LoginScreen from "@/screens/LoginScreen";
import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { isAuthenticated, subscribeAuthChanges, revalidateStoredSession } from "@/lib/auth";
import { isInTelegram, initTelegramApp } from "@/lib/telegram";
import KeyGuard from "@/components/KeyGuard";
import LoadingRing from "@/components/LoadingRing";
import HomeScreen from "@/screens/HomeScreen";
import SearchScreen from "@/screens/SearchScreen";
import MessagesScreen from "@/screens/MessagesScreen";
import ReelsScreen from "@/screens/ReelsScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import { loadProfileOverrides } from "@/data/mockData";
const AnalyticsScreen = lazy(() => import("@/screens/AnalyticsScreen"));
const ReelInsightsScreen = lazy(() => import("@/screens/ReelInsightsScreen"));
const ReelDetailScreen = lazy(() => import("@/screens/ReelDetailScreen"));
const ViewsDetailScreen = lazy(() => import("@/screens/InsightsScreen"));
const InteractionsDetailScreen = lazy(() => import("@/screens/InteractionsDetailScreen"));
const FollowersDetailScreen = lazy(() => import("@/screens/FollowersDetailScreen"));
const CreatorSettingsScreen = lazy(() => import("@/screens/CreatorSettingsScreen"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PaymentPage = lazy(() => import("./pages/PaymentPage"));
const AdminLogsPage = lazy(() => import("./pages/AdminLogsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Layout wrapper that conditionally shows BottomNav
const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const hideBottomNav = location.pathname.startsWith("/reel-insights/") || location.pathname.startsWith("/analytics");
  return (
    <div className="app-scroll-shell mx-auto max-w-[430px] min-h-screen bg-background relative shadow-2xl md:my-4 md:min-h-[calc(100vh-2rem)] md:rounded-2xl md:border md:border-border/30">
      <AnalyticsTracker />
      {children}
      {!hideBottomNav && <BottomNav />}
    </div>
  );
};

const App = () => {
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem("darksidex_splash_shown");
  });
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [checkingAuth, setCheckingAuth] = useState(false);
  const [inTelegram] = useState(() => isInTelegram());
  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
    sessionStorage.setItem("darksidex_splash_shown", "true");
  }, []);

  useEffect(() => {
    initTelegramApp();
  }, []);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeAuthChanges((authenticated) => {
      if (!mounted) return;
      setAuthed(authenticated);
      if (authenticated) {
        // Optimistic: UI is already usable, verify quietly in the background.
        void revalidateStoredSession().then((valid) => {
          if (mounted && !valid) setAuthed(false);
        });
      }
    });
    if (isAuthenticated()) {
      loadProfileOverrides();
      // No automatic scraper calls on app open: paid requests are only made
      // when the user searches or clones a username.
      void revalidateStoredSession().then((valid) => {
        if (mounted && !valid) setAuthed(false);
      });
    }

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authed) return;
    const onVisible = () => {};
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authed]);


  useEffect(() => {
    if (!authed) {
      (window as any).__removeSplash?.();
    }
  }, [authed]);

  // Allow toggling dark mode via ?theme=dark or ?theme=light in the URL.
  // Otherwise honor any persisted preference from localStorage so the
  // selected theme survives page reloads.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTheme = params.get("theme");
    const stored = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
    const theme = urlTheme || stored;
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      try { localStorage.setItem("theme", "dark"); } catch {}
    } else if (theme === "light") {
      document.documentElement.classList.remove("dark");
      try { localStorage.setItem("theme", "light"); } catch {}
    }
  }, []);

  const handleLoginSuccess = () => {
    loadProfileOverrides();
    setAuthed(true);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public payment page — accessible without login/key, used by Telegram bot users */}
            <Route
              path="/pay"
              element={
                <Suspense fallback={<LoadingRing />}>
                  <PaymentPage />
                </Suspense>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <Suspense fallback={<LoadingRing />}>
                  <AdminLogsPage />
                </Suspense>
              }
            />
            <Route
              path="*"
              element={
                checkingAuth ? (
                  <LoadingRing />
                ) : !authed ? (
                  inTelegram ? (
                    <Suspense fallback={<LoadingRing />}>
                      <PaymentPage />
                    </Suspense>
                  ) : (
                    <LoginScreen onLoginSuccess={handleLoginSuccess} />
                  )
                ) : (
                  <>
                    {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
                    {showSplash && <div className="fixed inset-0 z-[9998] bg-black" />}
                    <AppLayout>
                      <KeyGuard>
                        <Suspense fallback={<LoadingRing />}>
                        <Routes>
                          <Route path="/" element={<HomeScreen />} />
                          <Route path="/index" element={<HomeScreen />} />
                          <Route path="/search" element={<SearchScreen />} />
                          <Route path="/create" element={<MessagesScreen />} />
                          <Route path="/reels" element={<ReelsScreen />} />
                          <Route path="/profile" element={<ProfileScreen />} />
                          <Route path="/analytics" element={<AnalyticsScreen />} />
                          <Route path="/analytics/views" element={<ViewsDetailScreen />} />
                          <Route path="/analytics/interactions" element={<InteractionsDetailScreen />} />
                          <Route path="/analytics/followers" element={<FollowersDetailScreen />} />
                          <Route path="/analytics/settings" element={<CreatorSettingsScreen />} />
                          <Route path="/reel-insights/:id" element={<ReelInsightsScreen />} />
                          <Route path="/reel/:id" element={<ReelDetailScreen />} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                        </Suspense>
                      </KeyGuard>
                    </AppLayout>
                  </>
                )
              }
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
