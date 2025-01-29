import asyncio
import aiohttp
from aiohttp import web
import redis.asyncio as redis
from aiolimiter import AsyncLimiter
import uuid
from contextlib import suppress
import datetime
import json
import websockets
from pathlib import Path
from handlers.client_handler import ClientHandler

import numpy as np
from config.config import get_available_port
from config.config import load_clients_config
dist_path = Path(__file__).parent.parent / "dist"

class AsyncServer:
    def __init__(self, host, port, julia_port, redis_host, redis_port):
        """
        Initialize an AsyncServer instance.

        :param host: the host to bind to
        :param port: the port to bind to
        :param julia_port: the port to use for the Julia worker
        :param redis_host: the host to use for Redis
        :param redis_port: the port to use for Redis
        """
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
        self.task_queue = asyncio.Queue()
        self.app_runner = None
        self.julia_server = None
        self.main_task = None
        self.shutdown_event = asyncio.Event()
        self.pending_tasks = set()
        self.log_lock = asyncio.Lock()
        self.connected_websockets = set()

    async def handle_index(self, request):
        # Extract user data
        client_ip = request.remote  # Get the client's IP address
        query_params = request.query  # Get query parameters

        # Log the user data
        await self.log_to_file(f"User  accessed index page from IP: {client_ip}, Query Params: {query_params}")

        return web.FileResponse(dist_path / "index.html")
        
    async def start(self):
        """
        Start the AsyncServer.

        This method starts the HTTP server and the Julia socket server.
        It also starts the main loop of the server, which is responsible for
        processing tasks and updating the results cache.

        :return: a coroutine that starts the server
        """
        self.running = True
        await self.clear_log_file()
        
        try:
            self.redis_client = await redis.Redis(host=self.redis_host, port=self.redis_port)
            await self.redis_client.ping()
            await self.log_to_file(f"Connected to Redis at {self.redis_host}:{self.redis_port}")
        except redis.ConnectionError:
            await self.log_to_file(f"Failed to connect to Redis at {self.redis_host}:{self.redis_port}. Using in-memory queue.")
            self.redis_client = None

        app = web.Application()
        app.router.add_static('/assets', path=dist_path / 'assets', name='assets')
        app.add_routes([
            web.post('/tasks', self.handle_request),
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

        try:
            self.main_task = asyncio.create_task(self.main_loop())
            self.pending_tasks.add(self.main_task)
            self.main_task.add_done_callback(self.pending_tasks.discard)
        except Exception as e:
            await self.log_to_file(f"Failed to start main loop task: {e}")

    async def main_loop(self):
        while self.running:
            try:
                if not self.task_queue:
                    raise ValueError("task_queue is null or empty")
                await self.handle_tasks()
            except asyncio.CancelledError:
                break
            except Exception as e:
                await self.log_to_file(f"An error occurred in main loop: {e}")

    async def websocket_handler(self, request):
        """Handles incoming WebSocket connections."""
        task_id = request.match_info['task_id']

        # Ensure a ClientHandler exists for this task
        handler = ClientHandler(self, request, task_id)
        return await handler.handle_websocket()


    async def notify_websockets(self, message):
        for ws in self.connected_websockets:
            try:
                await ws.send_str(message)  # Assuming you want to send a string message
            except Exception as e:
                print(f"Error sending message to websocket: {e}")
                # You might want to remove the websocket from the set here if it's no longer valid

    async def clear_log_file(self):
        log_file_path = "server_logs.txt"
        async with self.log_lock:
            try:
                with open(log_file_path, "w") as log_file:
                    log_file.write("")
            except Exception as e:
                await self.log_to_file(f"An error occured while clearing the log file {e}")

    async def log_to_file(self, message):
        if not message:
            raise ValueError("message is null or empty")

        log_file_path = "server_logs.txt"
        # if not log_file_path:
        #     raise ValueError("log_file_path is null or empty")

        async with self.log_lock:
            # if not self.log_lock.locked():
            #     raise RuntimeError("log_lock is not locked")

            try:
                with open(log_file_path, "a") as log_file:
                    if not log_file:
                        raise ValueError("log_file is null or empty")

                    timestamp = datetime.datetime.now().isoformat()
                    if not timestamp:
                        raise ValueError("timestamp is null or empty ")

                    log_file.write(f"{timestamp} - {message}\n")
            except Exception as e:
                await self.log_to_file(f"An error occurred while logging to {log_file_path}: {e}")

    async def shutdown(self):
        """Shutdown the server gracefully"""
        await self.log_to_file(f"Shutting down server on {self.host}:{self.port}")
        self.running = False
        
        try:
            # Close all client connections
            if self.julia_clients is not None:
                for writer in list(self.julia_clients):
                    with suppress(Exception):
                        writer.close()
                        await writer.wait_closed()
                self.julia_clients.clear()

            # Close Redis connection
            if self.redis_client is not None:
                with suppress(Exception):
                    await self.redis_client.close()

            # Close the Julia server
            if self.julia_server is not None:
                with suppress(Exception):
                    self.julia_server.close()
                    await self.julia_server.wait_closed()

            # Close websocket connections
            for ws in self.connected_websockets:
                await ws.close(code=1001, message='Server shutdown')

            # Clear the set of connected websockets
            self.connected_websockets.clear()

            # Cleanup the HTTP server
            if self.app_runner is not None:
                with suppress(Exception):
                    await self.app_runner.cleanup()

            # Cancel pending tasks
            if self.pending_tasks is not None:
                tasks = [t for t in self.pending_tasks if not t.done()]
                for task in tasks:
                    task.cancel()
                with suppress(asyncio.CancelledError):
                    await asyncio.gather(*tasks, return_exceptions=True)
                self.pending_tasks.clear()

        except Exception as e:
            await self.log_to_file(f"Error during server shutdown: {e}")
        finally:
            await self.log_to_file(f"Server on {self.host}:{self.port} shut down complete")


    async def handle_request(self, request):
        await self.rate_limiter.acquire()

        if request.method == 'POST':
            if request.content_type != 'application/json':
                raise ValueError("Invalid content type")

            data = await request.json()
            if data is None:
                raise ValueError("Request body is null or empty")

            # if data.get('available_port') is None:
            #     raise ValueError("available_port is null or empty")

            task_id = str(uuid.uuid4())

            # Create an instance of ClientHandler to handle the request
            client_handler = ClientHandler(self, request, task_id)
            response = await client_handler.handle_request(data)
            return response

    async def handle_tasks(self):
        while self.running:
            try:
                if self.redis_client:
                    task_id = await asyncio.wait_for(self.redis_client.lpop('task_queue'), timeout=1.0)
                    if task_id is None:
                        continue
                else:
                    task_id = await asyncio.wait_for(self.task_queue.get(), timeout=1.0)
                    if task_id is None:
                        continue
                await self.handle_task(task_id.decode() if isinstance(task_id, bytes) else task_id)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                await self.log_to_file(f"Error while handling task: {e}")
    async def wait_for_result(self, task_id):
        while self.running:
            try:
                if self.redis_client:
                    result = await asyncio.wait_for(self.redis_client.lpop(f'result_{task_id}'), timeout=1.0)
                else:
                    result = self.results_cache.get(task_id)
                if result is not None:
                    return result.decode() if isinstance(result, bytes) else result
                await asyncio.sleep(0.1)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                await self.log_to_file(f"Error while waiting for result: {e}")
        return "Server shutdown before result was available"

    async def handle_task(self, task_id):
        if not task_id:
            raise ValueError("task_id is null or empty")
        
        task = None
        try:
            if self.redis_client:
                task = await self.redis_client.get(task_id)
            if task is None:
                task = task_id  # Fallback if task is not in Redis
        except Exception as e:
            await self.log_to_file(f"Error retrieving task {task_id}: {e}")
            return f"Error retrieving task {task_id}"

        try:
            result = self.process_task(task)
        except Exception as e:
            await self.log_to_file(f"Error processing task {task_id}: {e}")
            return f"Error processing task {task_id}"

        self.results_cache[task_id] = result

        if self.redis_client:
            try:
                await self.redis_client.lpush(f'result_{task_id}', result)
            except Exception as e:
                await self.log_to_file(f"Error pushing result to Redis for task {task_id}: {e}")

        return result

    def process_task(self, task):
        return f"Processed task: {task.decode()}" if isinstance(task, bytes) else f"Processed task: {task}"

    
    async def handle_julia_client(self, reader, writer):
        addr = writer.get_extra_info('peername')
        if addr is None:
            await self.log_to_file("Unable to retrieve peername info")
            return
        
        await self.log_to_file(f"New Julia connection from {addr}")
        
        client_task = asyncio.current_task()
        if client_task is not None:
            self.pending_tasks.add(client_task)

        try:
            self.julia_clients.add(writer)
            while self.running and not self.shutdown_event.is_set():
                read_task = asyncio.create_task(reader.read(1024))
                shutdown_task = asyncio.create_task(self.shutdown_event.wait())
                
                done, pending = await asyncio.wait(
                    [read_task, shutdown_task],
                    return_when=asyncio.FIRST_COMPLETED
                )

                for task in pending:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

                if shutdown_task in done:
                    break

                if read_task in done:
                    data = read_task.result()
                    if not data:
                        break
                    try:
                        message = data.decode()
                        await self.log_to_file(f"Received from Julia {addr}: {message}")
                        response = self.process_julia_message(message)  # Call it as a synchronous function
                        if response is not None:
                            writer.write(response.encode())  # Ensure response is a string
                            await writer.drain()
                    except Exception as e:
                        await self.log_to_file(f"Error processing message: {e}")
                        break
        except ConnectionResetError:
            await self.log_to_file(f"Julia connection from {addr} reset")
        except Exception as e:
            await self.log_to_file(f"Error handling Julia client: {e}")
        finally:
            self.pending_tasks.discard(client_task)
            self.julia_clients.discard(writer)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception as e:
                await self.log_to_file(f"Error cleaning up Julia client connection: {e}")
            await self.log_to_file(f"Julia connection from {addr} closed")


    def process_julia_message(self, message):
        """
        Process a message from a Julia client.

        :param message: the message from the Julia client
        :return: a response message to send back to the Julia client
        """
        if message is None:
            raise ValueError("message cannot be null")

        try:
            return f"Processed Julia message: {message}"
        except Exception as e:
            # Log the error, but there's no need to await log_to_file since it's not async anymore
            asyncio.create_task(self.log_to_file(f"Error processing message: {e}"))
            return None