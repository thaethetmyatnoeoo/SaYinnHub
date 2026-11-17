import { LanguageValidation } from "./i18n";
import "@fontsource/noto-sans-myanmar/myanmar-400.css";
import "@fontsource/noto-sans-myanmar/myanmar-700.css";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./style.css";
import "./spatial.css";
import "./glass.css";

createRoot(document.getElementById("root")).render(
  <>
    <LanguageValidation />
    <App />
  </>,
);
import "./features.css";

import "./theme.css";
import "./depth.css";
import "./corrections.css";
