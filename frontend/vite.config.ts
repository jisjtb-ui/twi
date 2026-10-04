import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // リポジトリルートの .env（PORT）を読んでバックエンドへのプロキシ先を決める
  const env = loadEnv(mode, "..", "");
  const apiPort = Number(process.env.PORT ?? env.PORT ?? 8787);
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": `http://127.0.0.1:${apiPort}`,
      },
    },
  };
});
