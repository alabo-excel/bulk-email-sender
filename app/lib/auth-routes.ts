/** React Router appends .data to paths for client-side loader requests. */
export function isPublicAuthRoute(pathname: string): boolean {
  const routePath = pathname.replace(/\.data$/, "");
  return /^\/sign-(in|up)(\/|$)/.test(routePath);
}
