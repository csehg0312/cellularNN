import threading
import asyncio
import websockets
import gradio as gr
import requests
import numpy as np
from PIL import Image
import io
import json

# Global variable to track the server thread
server_thread = None
ws_running = False

# WebSocket server handler
async def handle_connection(websocket, path):
    print("Client connected!")
    try:
        async for message in websocket:
            print(f"Received: {message}")
            await websocket.send(f"Echo: {message}")
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected!")

# Function to start the WebSocket server
def start_websocket_server(port):
    global ws_running
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    start_server = websockets.serve(handle_connection, "0.0.0.0", port)
    loop.run_until_complete(start_server)
    ws_running = True
    print(f"WebSocket server running on port {port}")
    loop.run_forever()

# Function to stop the WebSocket server
def stop_websocket_server():
    global server_thread, ws_running
    if server_thread and ws_running:
        print("Stopping WebSocket server...")
        server_thread._tstate_lock.release()  # Release the thread lock
        server_thread._stop()  # Stop the thread
        server_thread.join()  # Wait for the thread to finish
        ws_running = False
        print("WebSocket server stopped.")

# Cleanup function to release resources
def cleanup():
    stop_websocket_server()
    # Add any other cleanup actions here (e.g., releasing file handles, memory, etc.)
    print("Cleanup completed.")

def define_params():
    controlB = np.array([
        [1.0, 1.0, 1.0],
        [1.0, -8.0, 1.0],
        [1.0, 1.0, 1.0]
    ])

    feedA = np.array([
        [0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0]
    ])

    Ib = np.float64(-1.0)
    initialCondition = np.float64(0.0)
    t = np.linspace(0.0, 10.0, num=2)
    return controlB, feedA, Ib, initialCondition, t

def req_params(params):
    payload = json.dumps(params, indent=4)
    headers = {
        'Content-Type': 'application/json',
    }
    return payload, headers

def process_image(input_image):
    global server_thread, ws_running

    # Convert the input image to a format suitable for sending (JPEG)
    img_byte_arr = io.BytesIO()
    input_image.save(img_byte_arr, format='JPEG', quality=85)
    img_byte_arr = img_byte_arr.getvalue()

    controlB, feedA, Ib, initialCondition, t = define_params()
    image = Image.open(io.BytesIO(img_byte_arr))
    grayscaled = image.convert('L')
    np_grayscaled = np.array(grayscaled)

    async def send_image_data(ws_url, np_array):
        async with websockets.connect(ws_url) as websocket:
            # Convert the NumPy array to bytes
            np_bytes = np_array.astype(np.float32).tobytes()  

            # Send the binary data over the WebSocket
            await websocket.send(np_bytes)
            print("Image data sent over WebSocket.")

            # Receive and print the server's response (optional)
            response = await websocket.recv()
            print(f"Server response: {response}")

    params = {
        # "image": np_grayscaled.tolist(),
        "controlB": controlB.tolist(),
        "feedbackA": feedA.tolist(),
        "Ib": Ib.item(),
        "initialCondition": initialCondition.item(),
        "t_span": t.tolist(),
        "available_port": 7861
    }
    payload, headers = req_params(params)

    # Send POST request 
    response = requests.post('http://127.0.0.1:8082/tasks', headers=headers, data=payload)
    
    send_image_data(ws_url=response.json()['websocket_url'], np_array=np_grayscaled)
    # Extract the WebSocket port from the response
    websocket_url = f"ws://127.0.0.1:{params['available_port']}/"
    print(f"WebSocket URL: {websocket_url}, {response.text}")
    print(f"Server Response: {response.json()}")

    # Start the WebSocket server if not already running
    if not ws_running:
        try:
            server_thread = threading.Thread(target=start_websocket_server, args=(params['available_port'],))
            server_thread.daemon = True  # Daemonize the thread
            server_thread.start()
            print(f"WebSocket server started on port {params['available_port']}")
        except Exception as e:
            print(f"WebSocket server error: {e}")
            return f"WebSocket server error: {e}"

    # Check if the response is successful
    if response.status_code != 200:
        print(f"Error: {response.status_code} - {response.text}")
        return "Failed to send data."

    response_data = response.json()
    print("Response from POST:", response.text)

    # Perform cleanup after processing
    cleanup()

    return "WebSocket server started and cleaned up successfully!"



# Create the Gradio interface
iface = gr.Interface(
    fn=process_image,
    inputs=gr.Image(type="pil"),
    outputs="text",
    title="Image Processing with Server",
    description="Upload an image, and it will be processed by the server."
)

# Launch the interface
iface.launch()