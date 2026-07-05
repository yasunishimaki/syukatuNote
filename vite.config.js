import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" にしておくと、GitHub Pagesのどんなリポジトリ名でも動きます
export default defineConfig({
  plugins: [react()],
  base: "./",
});
