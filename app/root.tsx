import { isPublicAuthRoute } from "~/lib/auth-routes";
import { useEffect } from "react";
import { ClerkProvider, UserButton, useUser } from "@clerk/react-router";
import { clerkMiddleware, rootAuthLoader, getAuth } from "@clerk/react-router/server";
import { Provider, useAtomValue } from "jotai";
import { redirect } from "react-router";
import { localStore, clearSession, userId, stateAtom } from "~/lib/store";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const middleware: Route.MiddlewareFunction[] = [clerkMiddleware(), async (args, next) => {
  const path = new URL(args.request.url).pathname;
  if (!isPublicAuthRoute(path) && !path.startsWith("/api/")) {
    const auth = await getAuth(args);
    if (!auth.userId) throw redirect("/sign-in");
  }
  return next();
}];
export const loader = (args: Route.LoaderArgs) => rootAuthLoader(args);

export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: "/logo.svg" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href:
      "https://fonts.googleapis.com/css2" +
      "?family=DM+Sans:opsz,wght@9..40,300..700" +
      "&family=DM+Mono:wght@400;500" +
      "&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function NavItem({ to, also = [], children }: { to: string; also?: string[]; children: React.ReactNode }) {
  const { pathname } = useLocation();
  // Detail pages (a list's campaign, a report) keep their section highlighted.
  const inSection = also.some((prefix) => pathname.startsWith(prefix));
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive: exact }) => {
        const isActive = exact || inSection;
        return `relative inline-flex min-h-11 items-center px-3 text-sm font-medium transition
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          isActive
            ? "text-slate-950 after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary dark:text-white"
            : "text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
        }`;
      }}
    >
      {children}
    </NavLink>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return <ClerkProvider loaderData={loaderData} signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/sign-in"><Provider store={localStore}><AppShell /></Provider></ClerkProvider>;
}
function AppShell() {
  // Subscribe to the active storage atom so cross-tab changes stay current.
  const { sender } = useAtomValue(stateAtom);
  const { user, isLoaded } = useUser();
  const isOnboarded = isLoaded && user?.id === userId() && Boolean(sender);
  useEffect(() => {
    if (isLoaded && userId() && user?.id !== userId()) clearSession();
  }, [isLoaded, user?.id]);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="reveal reveal-1 border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-3 sm:flex-nowrap">
          <Link to="/" className="flex min-h-11 items-center gap-2.5 pb-3 sm:pb-3">
            <img src="/logo.svg" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-display text-lg font-semibold tracking-tight">
              Cold Email Sender
            </span>
          </Link>
          <div className="flex items-center gap-2 pb-3 sm:order-last">
            <UserButton />
          </div>
          {isOnboarded && (
            <nav aria-label="Main navigation" className="-mb-px flex w-full items-center gap-1 sm:mr-auto sm:w-auto sm:self-end">
              <NavItem to="/" also={["/lists/"]}>Lists</NavItem>
              <NavItem to="/activity" also={["/reports/"]}>Activity</NavItem>
              <NavItem to="/settings">Settings</NavItem>
            </nav>
          )}
        </div>
      </header>
      <main className="reveal reveal-2 mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 dark:border-slate-800">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-500 dark:text-slate-400">
          Lists, email history, and settings are saved in this browser for your account.
          Clearing browser data removes them. Keep this tab open while sending.
        </p>
      </footer>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
    if (import.meta.env.DEV) stack = error.stack;
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1 className="text-2xl font-semibold">{message}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">{details}</p>
      {stack && (
        <pre className="mt-4 w-full overflow-x-auto rounded-lg bg-slate-100 p-4 text-xs dark:bg-slate-900">
          <code>{stack}</code>
        </pre>
      )}
      <Link to="/" className="btn-secondary mt-6">
        Back to lists
      </Link>
    </main>
  );
}
