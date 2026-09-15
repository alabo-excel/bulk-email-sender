import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("lists/:listId", "routes/campaign.tsx"),
  route("reports/:reportId", "routes/report.tsx"),
  route("settings", "routes/settings.tsx"),
] satisfies RouteConfig;
