import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import { router } from "./routes";

ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        {/* Comportamiento de React Router 7 activado desde ya, para no migrar después. */}
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </React.StrictMode>
);