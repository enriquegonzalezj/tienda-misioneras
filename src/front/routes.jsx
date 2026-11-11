import {
    createBrowserRouter,
    createRoutesFromElements,
    Route,
} from "react-router-dom";
import { NotFound } from "./components/NotFound";
import { Cart } from "./pages/Cart";
import { Checkout } from "./pages/Checkout";
import { Layout } from "./pages/Layout";
import { Order } from "./pages/Order";
import { Home } from "./pages/Home";
import { Product } from "./pages/Product";
import { Shop } from "./pages/Shop";
import { AdminLayout, AdminNotFound } from "./pages/admin/AdminLayout";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { Categories } from "./pages/admin/Categories";
import { Inventory } from "./pages/admin/Inventory";
import { ProductForm } from "./pages/admin/ProductForm";
import { Shipping } from "./pages/admin/Shipping";

export const router = createBrowserRouter(
    createRoutesFromElements(
        <>
            <Route path="/" element={<Layout />} errorElement={<h1>Algo salió mal</h1>}>
                <Route index element={<Home />} />
                <Route path="tienda" element={<Shop />} />
                <Route path="categoria/:slug" element={<Shop />} />
                <Route path="producto/:slug" element={<Product />} />
                <Route path="carrito" element={<Cart />} />
                <Route path="pago" element={<Checkout />} />
                <Route path="pedido/:token" element={<Order />} />
                {/* Cualquier otra dirección: "Página no encontrada" con cabecera y pie.
                    El errorElement de arriba queda solo para fallos inesperados.
                    El código 404 real para Google lo pone Flask (src/api/seo.py). */}
                <Route path="*" element={<NotFound message="Revisa que la dirección esté bien escrita." />} />
            </Route>

            {/* Panel de administración (tarea 2.1): fuera del Layout de la tienda, sin su
                cabecera ni su pie. AdminLayout comprueba la sesión antes de mostrar nada. */}
            <Route path="/admin/entrar" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />} errorElement={<h1>Algo salió mal</h1>}>
                <Route index element={<Inventory />} />
                <Route path="categorias" element={<Categories />} />
                <Route path="envios" element={<Shipping />} />
                {/* Las dos con el mismo formulario. "nuevo" gana a ":id" porque
                    React Router prefiere el texto fijo; un id que no es número
                    muestra "Página no encontrada" dentro del panel. */}
                <Route path="productos/nuevo" element={<ProductForm />} />
                <Route path="productos/:id" element={<ProductForm />} />
                <Route path="*" element={<AdminNotFound />} />
            </Route>
        </>
    ),
    {
        // Comportamiento de React Router 7 activado desde ya, para no migrar después.
        future: { v7_relativeSplatPath: true },
    }
);
