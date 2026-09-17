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

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
          isActive
            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
        }`
      }
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
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
      <header className="reveal reveal-1 mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="" width={36} height={36} className="h-9 w-9" />
          <span className="font-display text-xl font-semibold tracking-tight">
            Cold Email Sender
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {isOnboarded && (
            <nav aria-label="Main navigation" className="flex items-center gap-1">
              <NavItem to="/">Lists</NavItem>
              <NavItem to="/activity">Activity</NavItem>
              <NavItem to="/settings">Settings</NavItem>
            </nav>
          )}
          <UserButton />
        </div>
      </header>
      <main className="reveal reveal-2 flex-1">
        <Outlet />
      </main>
      <footer className="mt-12 pt-4 text-center text-xs text-slate-500 dark:text-slate-400">
        Lists, email history, and settings are saved in this browser for your account.
        Clearing browser data removes them. Keep this tab open while sending.
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
