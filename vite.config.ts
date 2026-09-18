import netlifyReactRouter from "@netlify/vite-plugin-react-router";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode, command }) => {
  if (command === "serve") {
    // Vite loads .env for import.meta.env, but server routes read process.env.
    // Populate only server settings; never expose them with envPrefix or define.
    const env = loadEnv(mode, process.cwd(), "");
    for (const key of [
      "OPENAI_API_KEY", "OPENAI_DRAFT_MODEL", "AI_DRAFT_USAGE_STORE",
      "AI_DRAFT_LOCAL_DB", "AI_DRAFTS_PER_USER_PER_DAY", "AI_DRAFTS_PER_DAY",
      "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
      "CLERK_SECRET_KEY", "VAULT_KEY",
    ]) {
      if (process.env[key] === undefined && env[key] !== undefined) {
        process.env[key] = env[key];
      }
    }
  }

  return {
  // netlifyReactRouter() must come last. Without it the build emits no
  // serverless function, and since SSR produces no index.html, every route on
  // Netlify 404s.
  //
  // It targets Netlify Serverless Functions (Node). Do NOT pass `edge: true`:
  // the edge runtime is Deno, and mailer.server.ts and vault.server.ts depend
  // on node:dns, node:net and node:crypto.
  plugins: [tailwindcss(), reactRouter(), netlifyReactRouter()],

  resolve: {
    tsconfigPaths: true,
  },

  ssr: {
    noExternal: ["@clerk/react-router"],
  },
  };
});
