
const formulario = document.getElementById("zona-de-escritura");
const campoMensaje = document.getElementById("mensaje");
const botonEnviar = document.getElementById("enviar");
const zonaChat = document.getElementById("zona-de-chat");
const contenedorMensajes = document.getElementById("mensajes");

let sessionIdEnMemoria = null;
let ultimoEnvio = 0;

// Generar y recuperar el identificador de sesión
function obtenerSessionId() {
    try {
        let idGuardado = localStorage.getItem("sessionId");

        if (idGuardado) {
            return idGuardado;
        }

        const nuevoId = generarId();
        localStorage.setItem("sessionId", nuevoId);

        return nuevoId;

    } catch (error) {
        if (!sessionIdEnMemoria) {
            sessionIdEnMemoria = generarId();
        }

        return sessionIdEnMemoria;
    }
}

// Crear identificador único
function generarId() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return Date.now() + "-" + Math.random().toString(36).slice(2);
}

const sessionId = obtenerSessionId();

// Mostrar mensajes de forma segura
function mostrarMensaje(texto, tipo, estado = "") {
    const burbuja = document.createElement("div");

    burbuja.classList.add("mensaje", tipo);

    if (estado) {
        burbuja.classList.add(estado);
    }

    burbuja.textContent = texto;

    contenedorMensajes.appendChild(burbuja);

    zonaChat.scrollTop = zonaChat.scrollHeight;

    return burbuja;
}

// Esperar el tiempo necesario entre envíos
function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Obtener la respuesta de Make
function extraerRespuesta(texto) {
    if (!texto.trim()) {
        return "(respuesta vacía)";
    }

    try {
        const datos = JSON.parse(texto);

        if (datos && typeof datos === "object" && !Array.isArray(datos)) {

            const propiedades = [
                "response",
                "respuesta",
                "message",
                "mensaje"
            ];

            for (const propiedad of propiedades) {
                const valor = datos[propiedad];

                if (typeof valor === "string" && valor.trim()) {
                    return valor;
                }
            }

            return "Make respondió, pero sin el campo response";
        }

        return "Make respondió, pero sin el campo response";

    } catch (error) {
        return texto;
    }
}

// Enviar mensaje
formulario.addEventListener("submit", async function(evento) {
    evento.preventDefault();

    const mensaje = campoMensaje.value.trim();

    if (!mensaje || mensaje.length > 500) {
        return;
    }

    // Verificar configuración del webhook
    if (
        typeof WEBHOOK_URL === "undefined" ||
        !WEBHOOK_URL.trim() ||
        WEBHOOK_URL.includes("ACA VA")
    ) {
        mostrarMensaje(
            "Falta pegar la URL de tu webhook en config.js",
            "agente",
            "estado-error"
        );
        return;
    }

    mostrarMensaje(mensaje, "usuario");

    campoMensaje.value = "";

    // Deshabilitar controles
    campoMensaje.disabled = true;
    botonEnviar.disabled = true;

    const indicador = mostrarMensaje(
        "Preparando tu respuesta...",
        "agente",
        "estado-cargando"
    );

    let estadoFinal = "error";
    let controlador;
    let temporizador;

    try {
        // Pausa mínima de 1,5 segundos entre envíos
        const tiempoRestante = 1500 - (Date.now() - ultimoEnvio);

        if (tiempoRestante > 0) {
            await esperar(tiempoRestante);
        }

        // Controlar el tiempo máximo de espera
        controlador = new AbortController();

        temporizador = setTimeout(() => {
            controlador.abort();
        }, 30000);

        ultimoEnvio = Date.now();

        // Enviar únicamente los tres campos requeridos
        const respuesta = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                sessionId,
                mensaje,
                fecha: new Date().toISOString()
            }),
            signal: controlador.signal
        });

        clearTimeout(temporizador);

        // Verificar errores HTTP
        if (!respuesta.ok) {
            throw new Error("HTTP_" + respuesta.status);
        }

        // Leer respuesta del servidor
        const texto = await respuesta.text();

        const resultado = extraerRespuesta(texto);

        indicador.textContent = resultado;
        indicador.classList.remove("estado-cargando");

        estadoFinal = "exito";

    } catch (error) {

        indicador.classList.remove("estado-cargando");

        if (error.name === "AbortError") {
            indicador.textContent =
                "La respuesta tardó demasiado. Se agotó el tiempo de espera. Intentá nuevamente.";

        } else if (error.message.startsWith("HTTP_")) {

            const codigo = error.message.replace("HTTP_", "");

            indicador.textContent =
                `Make respondió con error (código ${codigo}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`;

        } else {

            indicador.textContent =
                "No se pudo conectar con el servidor. Revisá tu conexión e intentá nuevamente.";
        }

        indicador.classList.add("estado-error");

    } finally {

        // Limpiar temporizador y recuperar controles
        clearTimeout(temporizador);

        campoMensaje.disabled = false;
        botonEnviar.disabled = false;

        campoMensaje.focus();

        zonaChat.scrollTop = zonaChat.scrollHeight;
    }
});
