/** @type {import('tailwindcss').Config} */
export default {
  content: {
    relative: true,
    files: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  },
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#0B0F19",
        surface: {
          DEFAULT: "#141B2A",
          hover: "#1B2438",
          card: "#141B2A",
        },
        hud: {
          border: "#232B3D",
          borderHighlight: "#2A364F",
          primary: "#22D3EE",
          purple: "#8B5CF6",
          safe: "#4ADE80",
          warning: "#F59E0B",
          hazard: "#EF4444",
          text: "#F1F5F9",
          muted: "#94A3B8",
        },
      },
      fontFamily: {
        heading: ['"Space Grotesk"', "sans-serif"],
        sans: ["Inter", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        "hud-cyan": "0 0 25px -5px rgba(34, 211, 238, 0.3)",
        "hud-cyan-lg": "0 0 50px -10px rgba(34, 211, 238, 0.4)",
        "hud-hazard": "0 0 25px -5px rgba(239, 68, 68, 0.4)",
        "hud-warning": "0 0 25px -5px rgba(245, 158, 11, 0.3)",
      },
      animation: {
        "pulse-subtle": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 12s linear infinite",
      },
    },
  },
  plugins: [],
};
