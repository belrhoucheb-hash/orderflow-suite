import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/**/*.ts",
        "src/hooks/**/*.ts",
        "src/contexts/**/*.tsx",
        "src/pages/**/*.tsx",
        "src/components/**/*.tsx",
      ],
      exclude: [
        "src/components/ui/**",
        "src/integrations/**",
        "src/test/**",
        "src/**/*.d.ts",
      ],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 65,
        lines: 85,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
