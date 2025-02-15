import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: {
          DEFAULT: "#2A2F3C",
          border: "#2A2F3C",
        },
        input: "#2A2F3C",
        background: "#1A1F2C",
        foreground: "#FFFFFF",
        primary: {
          DEFAULT: "#9b87f5",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#7E69AB",
          foreground: "#FFFFFF",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "#2A2F3C",
          foreground: "#999999",
        },
        accent: {
          DEFAULT: "#6E59A5",
          foreground: "#FFFFFF",
        },
        card: {
          DEFAULT: "#222222",
          foreground: "#FFFFFF",
        }
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-purple": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "blink": {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" }
        },
        "scan": {
          "from": { transform: "translateY(-100%)" },
          "to": { transform: "translateY(100%)" }
        },
        "flicker": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.1" }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-purple": "pulse-purple 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "blink": "blink 0.8s steps(1) infinite",
        "scan": "scan 4s linear infinite",
        "flicker": "flicker 0.5s linear infinite"
      },
    },
  },
  plugins: [animate],
} satisfies Config;