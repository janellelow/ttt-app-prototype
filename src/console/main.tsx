import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/app.css";
import "../styles/console.css";
import { ConsoleAuthProvider } from "./auth";
import { ConsoleApp } from "./ConsoleApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConsoleAuthProvider>
      <ConsoleApp />
    </ConsoleAuthProvider>
  </StrictMode>,
);
