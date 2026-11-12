import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Two apps from one codebase:
//   index.html          -> the Telegram mini app (everyone)
//   console/index.html  -> the web console (trainers, admins, Heads; Google sign-in)
//
// `--mode demo` (npm run dev:demo / build:demo) runs both on sample data with
// no backend, for showing the team. See src/demo/supabase.ts.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "demo" ? [demoMode()] : [])],
  // Relative paths so the built app works from any static host or sub-folder.
  base: "./",
  server: { host: true, port: 5173 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        console: resolve(__dirname, "console/index.html"),
      },
    },
  },
}));

/** Swap the real Supabase client for the sample-data one, and fake Telegram. */
function demoMode(): Plugin {
  const real = resolve(__dirname, "src/lib/supabase.ts");
  const fake = resolve(__dirname, "src/demo/supabase.ts");
  const telegramStub = `<script>
      // Demo: stand-in for telegram-web-app.js so the mini app runs in a browser.
      (function () {
        var noop = function () {};
        var open = function (u) { window.open(u, "_blank", "noopener"); };
        window.Telegram = { WebApp: {
          initData: "demo", version: "7.0", ready: noop, expand: noop, setHeaderColor: noop, setBackgroundColor: noop,
          openLink: open, openTelegramLink: open,
          BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
        } };
      })();
    </script>`;
  return {
    name: "ttt-demo",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || importer === fake || !/supabase$/.test(source)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === real ? fake : null;
    },
    transformIndexHtml(html) {
      return html.replace(/<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>/, telegramStub);
    },
  };
}
