import json
import uuid
from aiohttp import web

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

        # You can send a message to the client if needed
        await self.websocket.send_str("WebSocket connection established!")

        # Handle WebSocket messages here
        async for msg in self.websocket:
            if msg.type == web.WSMsgType.TEXT:
                await self.websocket.send_str(f"Echo: {msg.data}")
            elif msg.type == web.WSMsgType.ERROR:
                print(f"WebSocket connection closed with error: {self.websocket.exception()}")

        return self.websocket

    
    async def handle_http(self, data):
        # Handle HTTP POST request
        if self.server.redis_client is None:
            raise ValueError("Redis client is null")

        # Process the data as needed (e.g., save the image)
        task_id = str(uuid.uuid4())
        
        # Here you can handle the image data if needed
        # For example, save the image to a file or process it
        # image_data = await request.post()  # If you're expecting an image in the request
        # await self.process_image(image_data)


        protocol = "wss" if self.request.scheme == "https" else "ws"
        # Generate a WebSocket URL for the client to connect to later
        websocket_url = f"{protocol}://{self.request.host}/ws/{task_id}"

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