// Página provisional mientras se construyen las pantallas aprobadas.
// Usa las clases del tema (index.css); se reemplaza cuando exista la pantalla de Inicio.
export const ComingSoon = () => {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
            <h1 className="text-4xl font-semibold">Tienda en construcción</h1>
            <p className="font-script text-3xl">Amar y consolar</p>
            <p className="text-muted">Vocaciones MHPVM. Muy pronto podrás comprar aquí.</p>
        </main>
    );
};
