import netlifyReactRouter from "@netlify/vite-plugin-react-router";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
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
});
