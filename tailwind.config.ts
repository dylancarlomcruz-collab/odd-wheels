import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        white: "rgb(var(--fg) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        bg: {
          950: "rgb(var(--bg-950) / <alpha-value>)",
          900: "rgb(var(--bg-900) / <alpha-value>)",
          800: "rgb(var(--bg-800) / <alpha-value>)",
          700: "rgb(var(--bg-700) / <alpha-value>)"
        },
        accent: {
          50: "#fff3ea",
          100: "#ffe2cc",
          200: "#ffc59a",
          300: "#ff9a52",
          400: "#f57b2a",
          500: "#d96a2b", // brand-ish orange
          600: "#b9521f",
          700: "#8f3c17",
          800: "#682c11",
          900: "#3f1b0a"
        }
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,.35)",
        glow: "0 0 0 1px rgba(217,106,43,.25), 0 12px 40px rgba(217,106,43,.12)"
      }
    }
  },
  plugins: []
} satisfies Config;
