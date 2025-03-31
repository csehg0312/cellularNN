import asyncio
import aiohttp
from aiohttp import web
import redis.asyncio as redis
from aiolimiter import AsyncLimiter
import uuid
from contextlib import suppress
import datetime
import json
import numpy as np
import utils.pkl_save as utils
from pathlib import Path
from handlers.client_handler import ClientHandler

dist_path = Path(__file__).parent.parent / "dist"

class AsyncServer:
    def __init__(self, host, port, julia_port, redis_host, redis_port):
        if not host or not port or not julia_port or not redis_host or not redis_port:
            raise ValueError("All initialization parameters must be provided and non-empty.")

        self.host = host
        self.port = port
        self.julia_port = julia_port
        self.redis_host = redis_host
        self.redis_port = redis_port
        self.redis_client = None
        self.rate_limiter = AsyncLimiter(10, 1)  # 10 requests per second
        self.results_cache = {}
        self.julia_clients = set()
        self.running = False
        self.app_runner = None
        self.julia_server = None
        self.shutdown_event = asyncio.Event()
        self.log_lock = asyncio.Lock()
        self.connected_websockets = set()

    async def handle_index(self, request):
        client_ip = request.remote
        query_params = request.query
        await self.log_to_file(f"User  accessed index page from IP: {client_ip}, Query Params: {query_params}")
        return web.FileResponse(dist_path / "index.html")
        
    async def start(self):
        self.running = True
        await self.clear_log_file()
        
        try:
            self.redis_client = await redis.Redis(host=self.redis_host, port=self.redis_port)
            await self.redis_client.ping()
            await self.log_to_file(f"Connected to Redis at {self.redis_host}:{self.redis_port}")
        except redis.ConnectionError:
            await self.log_to_file(f"Failed to connect to Redis at {self.redis_host}:{self.redis_port}. Using in-memory queue.")
            self.redis_client = None

        app = web.Application(client_max_size=10 * 1024 * 1024)
        app.router.add_static('/assets', path=dist_path / 'assets', name='assets')
        app.add_routes([
            web.post('/offer', self.handle_offer),
            web.post('/tasks', self.handle_request),
            web.post('/api/sparam', self.save_parameters),
            web.get('/ws/{task_id}', self.websocket_handler),  
            web.get('/', self.handle_index)          
        ])        
        self.app_runner = web.AppRunner(app)

        await self.app_runner.setup()
        site = web.TCPSite(self.app_runner, self.host, self.port)       
        await site.start()
        await self.log_to_file(f"Async HTTP server started on {self.host}:{self.port}")

        try:
            self.julia_server = await asyncio.start_server(
                self.handle_julia_client, self.host, self.julia_port
            )
            await self.log_to_file(f"Julia socket server started on {self.host}:{self.julia_port}")
        except Exception as e:
            await self.log_to_file(f"Failed to start Julia socket server on {self.host}:{self.julia_port}: {e}")
            return

     async def save_parameters(self, request):
        try:
            json_data = await request.json()
        except Exception as e:
            json_data = None

        if json_data is not None:
            # Unpack the fields from json_data

            try:
                radius = np.uint8(json_data.get('radius', None))
            except ValueError:
                return web.json_response({"error": "Invalid radius value or not value. It must be an integer."}, status=400)

            if radius != 0:
                def safe_float(value, default=0.0):
                    try:
                        if isinstance(value, str) and value.strip() == '':
                            return default
                        return np.float64(value)
                    except (ValueError, TypeError):
                        return default
                try:
                    fdb_list = json_data.get('fdb', [])
                    ctrl_list = json_data.get('ctrl', [])

                    # Convert each element using safe_float
                    fdb = np.array([safe_float(val) for val in fdb_list], dtype='float64')
                    ctrl = np.array([safe_float(val) for val in ctrl_list], dtype='float64')

                    bias = safe_float(json_data.get('bias', 0.0))
                    tspan = safe_float(json_data.get('tspan', 0))
                    initial = safe_float(json_data.get('initial', 1.0))
                    stepsize = safe_float(json_data.get('stepsize', 0.1))

                except Exception as e:
                    return web.json_response(status=500, text=f"Error {e}")
                try:
                    status, text = utils.process_saving(radius=radius, fdb=fdb, ctrl=ctrl, bias=bias, tspan=tspan, initial=initial, stepsize=stepsize)
                    return web.Response(
                        status=status,
                        text=text
                    )
                except ValueError as e:
                    return web.json_response({"error": str(e)}, status=400)
            else:
                return web.json_response(status=200, text="The radius is 0, excepted minimum of 1!")
                # You can now use these variables as needed

        else:
            response_text = 'No valid JSON data received.'

    async def websocket_handler(self, request):
        task_id = request.match_info['task_id']
        handler = ClientHandler(self, request, task_id)
        return await handler.handle_websocket()

    async def handle_offer(self, request):
        data = await request.json()
        handler = ClientHandler(self, request, None)
        return await handler.handle_offer_http(data)

    async def notify_websockets(self, message):
        for ws in self.connected_websockets:
            try:
                await ws.send_str(message)
            except Exception as e:
                print(f"Error sending message to websocket: {e}")

    async def clear_log_file(self):
        log_file_path = "server_logs.txt"
        async with self.log_lock:
            try:
                with open(log_file_path, "w") as log_file:
                    log_file.write("")
            except Exception as e:
                await self.log_to_file(f"An error occurred while clearing the log file {e}")

    async def log_to_file(self, message):
        if not message:
            raise ValueError("message is null or empty")

        log_file_path = "server_logs.txt"
        async with self.log_lock:
            try:
                with open(log_file_path, "a") as log_file:
                    timestamp = datetime.datetime.now().isoformat()
                    log_file.write(f"{timestamp} - {message}\n")
            except Exception as e:
                await self.log_to_file(f"An error occurred while logging to {log_file_path}: {e}")

    async def shutdown(self):
        """Shutdown the server gracefully"""
        await self.log_to_file(f"Shutting down server on {self.host}:{self.port}")
        self.running = False
        
        try:
            if self.julia_clients:
                for writer in list(self.julia_clients):
                    with suppress(Exception):
                        writer.close()
                        await writer.wait_closed()
                self.julia_clients.clear()

            if self.redis_client:
                with suppress(Exception):
                    await self.redis_client.close()

            if self.julia_server:
                with suppress(Exception):
                    self.julia_server.close()
                    await self.julia_server.wait_closed()

            for ws in self.connected_websockets:
                await ws.close(code=1001, message='Server shutdown')

            self.connected_websockets.clear()

            if self.app_runner:
                with suppress(Exception):
                    await self.app_runner.cleanup()

        except Exception as e:
            await self.log_to_file(f"Error during server shutdown: {e}")
        finally:
            await self.log_to_file(f"Server on {self.host}:{self.port} shut down complete")

    async def handle_request(self, request):
        await self.rate_limiter.acquire()

        if request.method == 'POST':
            try:
                if request.content_type != 'application/json':
                    return web.Response(
                        status=415,
                        text='Invalid content type',
                    )

                data = await request.json()
                if data is None:
                    raise ValueError("Request body is null or empty")

                task_id = str(uuid.uuid4())
                client_handler = ClientHandler(self, request, task_id)
                return await client_handler.handle_request(data)

            except json.JSONDecodeError:
                return web.Response(
                    status=400,
                    text='Invalid JSON format',
                )
            except Exception as e:
                return web.Response(
                    status=500,
                    text=f'Server error: {str(e)}',
                )

    async def handle_julia_client(self, reader, writer):
        addr = writer.get_extra_info('peername')
        if addr is None:
            await self.log_to_file("Unable to retrieve peername info")
            return
        
        await self.log_to_file(f"New Julia connection from {addr}")
        
        try:
            self.julia_clients.add(writer)
            while self.running:
                data = await reader.read(1024)
                if not data:
                    break
                try:
                    message = data.decode()
                    await self.log_to_file(f"Received from Julia {addr}: {message}")
                    response = self.process_julia_message(message)
                    if response is not None:
                        writer.write(response.encode())
                        await writer.drain()
                except Exception as e:
                    await self.log_to_file(f"Error processing message: {e}")
                    break
        except ConnectionResetError:
            await self.log_to_file(f"Julia connection from {addr} reset")
        except Exception as e:
            await self.log_to_file(f"Error handling Julia client: {e}")
        finally:
            self.julia_clients.discard(writer)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception as e:
                await self.log_to_file(f"Error cleaning up Julia client connection: {e}")
            await self.log_to_file(f"Julia connection from {addr} closed")

    def process_julia_message(self, message):
        if message is None:
            raise ValueError("message cannot be null")

        try:
            return f"Processed Julia message: {message}"
        except Exception as e:
            asyncio.create_task(self.log_to_file(f"Error processing message: {e}"))
            return None
