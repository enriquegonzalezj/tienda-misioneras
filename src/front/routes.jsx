import {
    createBrowserRouter,
    createRoutesFromElements,
    Route,
} from "react-router-dom";
import { Layout } from "./pages/Layout";
import { Home } from "./pages/Home";
import { Shop } from "./pages/Shop";

export const router = createBrowserRouter(
    createRoutesFromElements(
        <Route path="/" element={<Layout />} errorElement={<h1>Página no encontrada</h1>}>
            <Route index element={<Home />} />
            <Route path="tienda" element={<Shop />} />
        </Route>
    ),
    {
        // Comportamiento de React Router 7 activado desde ya, para no migrar después.
        future: { v7_relativeSplatPath: true },
    }
);
