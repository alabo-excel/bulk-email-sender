import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("sign-in/*", "routes/sign-in.tsx"),
  route("sign-up/*", "routes/sign-up.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("api/session", "routes/session.ts"),
  route("api/smtp", "routes/smtp.ts"),
  route("api/vault", "routes/vault.ts"),
  route("activity", "routes/activity.tsx"),
  index("routes/home.tsx"),
  route("lists/:listId", "routes/campaign.tsx"),
  route("reports/:reportId", "routes/report.tsx"),
  route("settings", "routes/settings.tsx"),
] satisfies RouteConfig;
