// Página provisional mientras se construyen las pantallas aprobadas.
// Los estilos van en línea porque Tailwind todavía no está instalado;
// esta página se reemplaza cuando exista la pantalla de Inicio.
export const ComingSoon = () => {
    return (
        <main
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                padding: "24px",
                textAlign: "center",
                fontFamily: "system-ui, sans-serif",
                color: "#0C3F68",
            }}
        >
            <h1 style={{ margin: 0 }}>Tienda en construcción</h1>
            <p style={{ margin: 0, color: "#4A5560" }}>
                Vocaciones MHPVM. Muy pronto podrás comprar aquí.
            </p>
        </main>
    );
};