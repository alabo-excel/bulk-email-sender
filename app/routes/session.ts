import { getAuth } from "@clerk/react-router/server";
import type { Route } from "./+types/session";
export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);
  return Response.json({ userId }, { status: userId ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}
