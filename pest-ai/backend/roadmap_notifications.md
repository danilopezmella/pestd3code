Paso 1: Crear WebSockets en el Backend (FastAPI)
Añade esto en tu backend para manejar conexiones WebSocket:

from fastapi import FastAPI, WebSocket
import asyncio

app = FastAPI()

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """Maneja conexiones WebSocket y envía actualizaciones al frontend."""
    await websocket.accept()
    
    # Simulación del proceso de búsqueda con estados
    search_steps = ["Starting search...", "Fetching results...", "Processing data...", "Done!"]
    
    for step in search_steps:
        await websocket.send_text(step)  # Envía el estado al frontend
        await asyncio.sleep(2)  # Simula tiempo de procesamiento
    
    await websocket.close()  # Cierra la conexión cuando termina la búsqueda


from fastapi import FastAPI, WebSocket
import asyncio

app = FastAPI()

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """Maneja conexiones WebSocket y envía actualizaciones al frontend."""
    await websocket.accept()
    
    # Simulación del proceso de búsqueda con estados
    search_steps = ["Starting search...", "Fetching results...", "Processing data...", "Done!"]
    
    for step in search_steps:
        await websocket.send_text(step)  # Envía el estado al frontend
        await asyncio.sleep(2)  # Simula tiempo de procesamiento
    
    await websocket.close()  # Cierra la conexión cuando termina la búsqueda

const socket = new WebSocket("ws://localhost:8000/ws/user123");

socket.onmessage = function(event) {
    console.log("Estado de búsqueda:", event.data);
    document.getElementById("status").innerText = event.data;
};

socket.onclose = function() {
    console.log("Búsqueda completada y conexión cerrada.");
};