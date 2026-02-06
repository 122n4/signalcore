/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0B0F19",
          700: "#1F2937",
          500: "#6B7280",
        },
        canvas: {
          50: "#FAFAFB",
          100: "#F4F4F6",
        },
        signal: {
          700: "#0E6B4F", // verde profundo (CTA)
          800: "#0B5B43",
        },
        border: {
          soft: "rgba(15, 23, 42, 0.10)",
        },
      },
      boxShadow: {
        soft: "0 10px 30px rgba(2, 6, 23, 0.06)",
        card: "0 8px 24px rgba(2, 6, 23, 0.08)",
      },
      borderRadius: {
        "2xl": "22px",
        "3xl": "28px",
      },
    },
  },
  plugins: [],
};