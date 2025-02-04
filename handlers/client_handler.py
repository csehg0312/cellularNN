import json
import uuid
from aiohttp import web
from utils.load_parameters import load_parameters_for_mode
import gc
import numpy as np
import base64
import cv2

class ClientHandler:
    def __init__(self, server, request, task_id):
        self.server = server
        self.request = request
        self.task_id = task_id
        self.websocket = None

    async def handle_request(self, data):

        if self.request.headers.get('Upgrade', '').lower() == 'websocket':
            return await self.handle_websocket()
        else:
            # Handle regular HTTP requests (e.g., POST)
            return await self.handle_http(data)

        # web.WebSocketResponse()
        # self.websocket = web.WebSocketResponse()
        # await self.websocket.prepare(self.request)
        # self.server.connected_websockets.add(self.websocket)
        # print(f"New connection from {self.request.remote}")


        # # Check if Redis client is available
        # if self.server.redis_client is None:
        #     raise ValueError("Redis client is null")

        # # Store the incoming JSON to Redis database as the key
        # # await self.server.redis_client.set(f'task:data:{self.task_id}', json.dumps(data))

        # # Push task_id to task queue
        # # await self.server.redis_client.lpush('queue:task_queue', self.task_id)

        # return self.websocket

    async def handle_websocket(self):
        self.websocket = web.WebSocketResponse()
        await self.websocket.prepare(self.request)
        self.server.connected_websockets.add(self.websocket)
        print(f"New WebSocket connection from {self.request.remote}")

        try:
            # Send a welcome message to the client
            await self.websocket.send_str("WebSocket connection established!")

            # Handle WebSocket messages
            async for msg in self.websocket:
                if msg.type == web.WSMsgType.TEXT:
                    # Check if the message is a binary image URL
                    # print(f'Type is: {type(msg.data)} Data: {msg.data}')
                    try:
                        image_data = msg.data.strip()
                        if image_data.startswith('"') and image_data.endswith('"'):
                            image_data = image_data[1:-1] 

                        header, encoded = image_data.split(',', 1)
                        print(header)
                        print(encoded)
                    except:
                        header, encoded = None, None
                    if header == ('data:image/png;base64'):
                        print("The png image is coming")
                        # Handle the binary image URL
                        for ws in self.server.connected_websockets:
                            if ws is not self.websocket:  # Avoid sending the message back to the sender
                                await ws.send_str(json.dumps({
                                    "type": "image",
                                    "data": image_data
                                }))
                    else:
                        # Send non-image messages as JSON
                        for ws in self.server.connected_websockets:
                            if ws is not self.websocket:  # Avoid sending the message back to the sender
                                await ws.send_str(json.dumps({
                                    "type": "status",
                                    "message": msg.data  # e.g., "WebSocket connection established!"
                                }))
                elif msg.type == web.WSMsgType.ERROR:
                    print(f"WebSocket connection closed with error: {self.websocket.exception()}")
                    break  # Exit the message loop on error

        except Exception as e:
            print(f"Unexpected error in WebSocket handler: {e}")
        finally:
            # Clean up the WebSocket connection
            self.server.connected_websockets.remove(self.websocket)
            print(f"WebSocket connection closed from {self.request.remote}")
            return self.websocket  # Always return the WebSocketResponse object

    
    async def handle_http(self, data):
        if data is None:
            raise ValueError("data is null or empty")
        
        if not data.get('mode'):
            raise ValueError("mode chosen is null or empty")

        params = load_parameters_for_mode(data.get('mode'))
        if params is None:
            raise ValueError("Parameters for mode not found")

        # Handle HTTP POST request
        if self.server.redis_client is None:
            raise ValueError("Redis client is null")

        # Process the data as needed (e.g., save the image)
        task_id = str(uuid.uuid4())

        # ✅ Initialize `image_data` to avoid UnboundLocalError
        image_data = None  
        width, height = None, None  # ✅ Initialize width & height
        
        try:
            image_data = data.get('image', '').encode()
        
            if image_data.startswith(b'data:image'):
                # Find the base64 data
                base64_start = image_data.find(b',') + 1
                image_data = base64.b64decode(image_data[base64_start:])  # Decode from bytes

                # Convert the byte data to a NumPy array
                np_array = np.frombuffer(image_data, dtype=np.uint8)
                image = cv2.imdecode(np_array, cv2.IMREAD_GRAYSCALE)

                # Convert the image to a list for JSON serialization
                data['image'] = image.tolist()  # Convert ndarray to list
                data['feedbackA'] = params['A'].tolist()
                data['controlB'] = params['B'].tolist()
                data['t_span'] = params['t'].tolist()
                data['Ib'] = params['Ib']
                data['initialCondition'] = params['init']
                data['mode'] = None

            else:
                return web.Response(status=400, text="Invalid image format")
        
        except Exception as e:
            return web.Response(status=500, text=f"Error processing image: {e}")
        
        finally:
            # Clean up if necessary
            if 'image_data' in locals():
                del image_data
            # del data, image_data, keep_original_size, selected_size, invert_size


        protocol = "wss" if self.request.scheme == "https" else "ws"
        # Generate a WebSocket URL for the client to connect to later
        websocket_url = f"{protocol}://{self.request.host}/ws/{task_id}"
        data['websocket'] = websocket_url
        # # Store the incoming JSON to Redis database as the key
        await self.server.redis_client.set(f'task:data:{self.task_id}', json.dumps(data))

        # # Push task_id to task queue
        await self.server.redis_client.lpush('queue:task_queue', self.task_id)

        return web.json_response({
            'server_response': "All data received successfully!",
            'response_status': 200,
            'task_id': task_id,
            'websocket_url': websocket_url  # Send back the WebSocket URL
        })

    async def send(self, message):
        """Send a message to the client via WebSocket."""
        if self.websocket is not None:
            try:
                await self.websocket.send_str(message)
            except Exception as e:
                print(f"Error sending to {self.request.remote}: {e}")

    async def close(self):
        """Close the WebSocket connection."""
        if self.websocket is not None:
            await self.websocket.close()
            print(f"Connection with {self.request.remote} closed.")
            self.websocket = None  # Clear the refer