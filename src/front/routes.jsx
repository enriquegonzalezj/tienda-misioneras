import {
    createBrowserRouter,
    createRoutesFromElements,
    Route,
} from "react-router-dom";
import { NotFound } from "./components/NotFound";
import { AboutUs } from "./pages/AboutUs";
import { Account } from "./pages/Account";
import { Cart } from "./pages/Cart";
import { Checkout } from "./pages/Checkout";
import { Contact } from "./pages/Contact";
import { Donate } from "./pages/Donate";
import { Donation } from "./pages/Donation";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Layout } from "./pages/Layout";
import { Login } from "./pages/Login";
import { Order } from "./pages/Order";
import { Home } from "./pages/Home";
import { Product } from "./pages/Product";
import { Register } from "./pages/Register";
import { ResetPassword } from "./pages/ResetPassword";
import { ShippingReturns } from "./pages/ShippingReturns";
import { Shop } from "./pages/Shop";
import { AdminLayout, AdminNotFound } from "./pages/admin/AdminLayout";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { CampaignForm } from "./pages/admin/CampaignForm";
import { Campaigns } from "./pages/admin/Campaigns";
import { Categories } from "./pages/admin/Categories";
import { Donations } from "./pages/admin/Donations";
import { Inventory } from "./pages/admin/Inventory";
import { OrderDetail } from "./pages/admin/OrderDetail";
import { Orders } from "./pages/admin/Orders";
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
                {/* Donativos (tarea 4.9): el formulario y la página de cada
                    donativo (noindex por el prefijo "donativo", app.py). Las
                    mismas direcciones están en page_for (src/api/seo.py). */}
                <Route path="donaciones" element={<Donate />} />
                <Route path="donativo/:token" element={<Donation />} />
                {/* Páginas de texto (tarea 5.3). También en page_for (seo.py). */}
                <Route path="quienes-somos" element={<AboutUs />} />
                <Route path="contacto" element={<Contact />} />
                <Route path="envios-y-devoluciones" element={<ShippingReturns />} />
                {/* Cuenta de cliente (tarea 4.4). Llevan noindex por el prefijo
                    "cuenta" y "restablecer-contrasena" (app.py). Las mismas
                    direcciones están en page_for (src/api/seo.py). */}
                <Route path="cuenta" element={<Account />} />
                <Route path="cuenta/entrar" element={<Login />} />
                <Route path="cuenta/crear" element={<Register />} />
                <Route path="cuenta/recuperar" element={<ForgotPassword />} />
                <Route path="restablecer-contrasena" element={<ResetPassword />} />
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
                {/* Pedidos (tarea 5.5): la lista y el detalle de cada pedido. */}
                <Route path="pedidos" element={<Orders />} />
                <Route path="pedidos/:id" element={<OrderDetail />} />
                {/* Donativos (tarea 4.9): solo la lista. */}
                <Route path="donativos" element={<Donations />} />
                <Route path="categorias" element={<Categories />} />
                <Route path="envios" element={<Shipping />} />
                {/* Las dos con el mismo formulario. "nuevo" gana a ":id" porque
                    React Router prefiere el texto fijo; un id que no es número
                    muestra "Página no encontrada" dentro del panel. */}
                <Route path="productos/nuevo" element={<ProductForm />} />
                <Route path="productos/:id" element={<ProductForm />} />
                {/* Campañas (tarea 4.8): igual que productos, "nueva" y ":id" con
                    el mismo formulario. */}
                <Route path="campanas" element={<Campaigns />} />
                <Route path="campanas/nueva" element={<CampaignForm />} />
                <Route path="campanas/:id" element={<CampaignForm />} />
                <Route path="*" element={<AdminNotFound />} />
            </Route>
        </>
    ),
    {
        // Comportamiento de React Router 7 activado desde ya, para no migrar después.
        future: { v7_relativeSplatPath: true },
    }
);
