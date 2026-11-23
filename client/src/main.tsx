import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "./lib/query";
import { Capture } from "./features/capture/Capture";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Falta el contenedor de la aplicación.");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}><Capture /></QueryClientProvider>
  </StrictMode>,
);
