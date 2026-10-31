import {
    createBrowserRouter,
    createRoutesFromElements,
    Route,
} from "react-router-dom";
import { NotFound } from "./components/NotFound";
import { Layout } from "./pages/Layout";
import { Home } from "./pages/Home";
import { Product } from "./pages/Product";
import { Shop } from "./pages/Shop";
import { AdminLayout, AdminNotFound } from "./pages/admin/AdminLayout";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { Categories } from "./pages/admin/Categories";
import { Inventory } from "./pages/admin/Inventory";

export const router = createBrowserRouter(
    createRoutesFromElements(
        <>
            <Route path="/" element={<Layout />} errorElement={<h1>Página no encontrada</h1>}>
                <Route index element={<Home />} />
                <Route path="tienda" element={<Shop />} />
                <Route path="categoria/:slug" element={<Shop />} />
                <Route path="producto/:slug" element={<Product />} />
                {/* Cualquier otra dirección: "Página no encontrada" con cabecera y pie.
                    El errorElement de arriba queda solo para fallos inesperados.
                    (El código 404 real para Google lo pone el servidor en la tarea 3.5.) */}
                <Route path="*" element={<NotFound message="Revisa que la dirección esté bien escrita." />} />
            </Route>

            {/* Panel de administración (tarea 2.1): fuera del Layout de la tienda, sin su
                cabecera ni su pie. AdminLayout comprueba la sesión antes de mostrar nada. */}
            <Route path="/admin/entrar" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />} errorElement={<h1>Algo salió mal</h1>}>
                <Route index element={<Inventory />} />
                <Route path="categorias" element={<Categories />} />
                <Route path="*" element={<AdminNotFound />} />
            </Route>
        </>
    ),
    {
        // Comportamiento de React Router 7 activado desde ya, para no migrar después.
        future: { v7_relativeSplatPath: true },
    }
);
