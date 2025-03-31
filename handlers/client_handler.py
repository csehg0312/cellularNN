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

        # Frame rate control parameters
        self.max_fps = 30  # Default max frames per second
        self.frame_interval = 1.0 / self.max_fps  # Minimum time between frames
        self.last_frame_time = 0  # Timestamp of last processed frame
        self.skip_frames = False  # Whether to enable frame skipping
        self.frames_to_skip = 0  # Counter for frame skipping
        self.frame_skip_pattern = 0  # 0 = process every frame, 1 = every other frame, etc.

    # Add this method to update frame rate settings
    async def set_frame_rate(self, fps):
        """
        Set the maximum frames per second for processing.
        
        Args:
            fps: Frames per second (integer)
        """
        if fps <= 0:
            raise ValueError("FPS must be positive")
            
        self.max_fps = fps
        self.frame_interval = 1.0 / self.max_fps
        
        # Log the change
        # self.log_to_file(f"Frame rate set to {fps} FPS")
        
        # Notify client about the changed settings
        if self.websocket is not None:
            await self.websocket.send_str(json.dumps({
                "type": "settings",
                "fps": fps,
                "frame_interval": self.frame_interval
            }))

    async def handle_request(self, data):

        if self.request.headers.get('Upgrade', '').lower() == 'websocket':
            return await self.handle_websocket()
        else:
            # Handle regular HTTP requests (e.g., POST)
            return await self.handle_http(data)

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
                        # print(encoded)
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
                                self.server.connected_websockets.remove(self.websocket)
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


        #protocol = "wss" if self.request.scheme == "https" else "ws"
        protocol = "ws"
        # Generate a WebSocket URL for the client to connect to later
        websocket_url = f"{protocol}://0.0.0.0:8082/ws/{task_id}"
        websocket_url_client = f"{protocol}://0.0.0.0:9000/ws/{task_id}"
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
    async def handle_offer_ws(self, ws_client, ws_local, data):
        """
        Handle WebSocket connections for video streaming with frame rate control.
        """
        # Set up the WebSocket connection
        self.websocket = web.WebSocketResponse()
        await self.websocket.prepare(self.request)
        self.server.connected_websockets.add(self.websocket)
        print(f"New streaming WebSocket connection from {self.request.remote}")
        
        # Extract parameters for this stream
        params = load_parameters_for_mode(data.get('mode'))
        stream_id = data.get('stream_id', str(uuid.uuid4()))
        
        # Set frame rate if specified in data
        if 'fps' in data:
            await self.set_frame_rate(int(data['fps']))
        
        try:
            # Send confirmation to the client
            await self.websocket.send_str(json.dumps({
                "type": "connection",
                "status": "established",
                "stream_id": stream_id,
                "fps": self.max_fps
            }))
            
            # Store stream configuration in Redis
            stream_config = {
                'stream_id': stream_id,
                'params': {
                    'feedbackA': params['A'].tolist() if params and 'A' in params else [],
                    'controlB': params['B'].tolist() if params and 'B' in params else [],
                    't_span': params['t'].tolist() if params and 't' in params else [],
                    'Ib': params['Ib'] if params and 'Ib' in params else 0,
                    'initialCondition': params['init'] if params and 'init' in params else 0,
                    'fps': self.max_fps
                },
                'active': True,
                'client_ws': ws_client
            }
            
            await self.server.redis_client.set(
                f'stream:config:{stream_id}', 
                json.dumps(stream_config)
            )
            
            frame_count = 0
            
            # Process incoming WebSocket messages (video frames)
            async for msg in self.websocket:
                if msg.type == web.WSMsgType.TEXT:
                    # Handle text messages (e.g., control commands)
                    try:
                        command = json.loads(msg.data)
                        
                        # Handle frame rate control commands
                        if command.get('type') == 'settings' and 'fps' in command:
                            await self.set_frame_rate(int(command['fps']))
                            continue
                            
                        # Process other control messages
                        if command.get('type') == 'control':
                            await self.server.redis_client.publish(
                                'channel:stream:control',
                                json.dumps({
                                    'stream_id': stream_id,
                                    'command': command
                                })
                            )
                    except json.JSONDecodeError:
                        print(f"Invalid JSON received: {msg.data}")
                        
                elif msg.type == web.WSMsgType.BINARY:
                    # Apply frame rate control
                    current_time = time.time()
                    frame_count += 1
                    
                    # Skip frames if necessary
                    if self.skip_frames:
                        if self.frames_to_skip > 0:
                            self.frames_to_skip -= 1
                            continue  # Skip this frame
                    
                    # Check if we need to process this frame based on timing
                    elapsed = current_time - self.last_frame_time
                    if elapsed < self.frame_interval:
                        # Too soon for next frame, skip it
                        continue
                    
                    # Apply frame skipping pattern (if enabled)
                    if self.frame_skip_pattern > 0 and (frame_count % (self.frame_skip_pattern + 1)) != 0:
                        continue  # Skip based on pattern
                    
                    # Process the frame
                    self.last_frame_time = current_time
                    frame_data = msg.data
                    
                    # Store the frame in Redis with a timestamp
                    timestamp = await self.server.redis_client.time()
                    frame_key = f'stream:frame:{stream_id}:{timestamp[0]}.{timestamp[1]}'
                    
                    # Save the raw frame data
                    await self.server.redis_client.set(frame_key, frame_data)
                    
                    # Notify processors that a new frame is available
                    await self.server.redis_client.publish(
                        'channel:new_frame',
                        json.dumps({
                            'stream_id': stream_id,
                            'frame_key': frame_key,
                            'timestamp': f'{timestamp[0]}.{timestamp[1]}',
                            'frame_number': frame_count
                        })
                    )
                    
                elif msg.type == web.WSMsgType.ERROR:
                    print(f"WebSocket connection closed with error: {self.websocket.exception()}")
                    break
                    
        except Exception as e:
            print(f"Error in stream WebSocket handler: {e}")
        finally:
            # Clean up
            self.server.connected_websockets.remove(self.websocket)
            
            # Mark stream as inactive in Redis
            try:
                config = await self.server.redis_client.get(f'stream:config:{stream_id}')
                if config:
                    config_data = json.loads(config)
                    config_data['active'] = False
                    await self.server.redis_client.set(
                        f'stream:config:{stream_id}', 
                        json.dumps(config_data)
                    )
            except Exception as cleanup_error:
                print(f"Error during cleanup: {cleanup_error}")
                
            print(f"Streaming WebSocket connection closed from {self.request.remote}")
            return self.websocket

    # Add these methods for dynamic frame rate control
    async def set_frame_skip_pattern(self, pattern):
        """
        Set frame skipping pattern (0 = process all frames, 1 = every other frame, etc.)
        
        Args:
            pattern: Integer representing frames to skip between processed frames
        """
        self.frame_skip_pattern = max(0, int(pattern))
        # self.log_to_file(f"Frame skip pattern set to {self.frame_skip_pattern}")
        
        # Notify client about the changed settings
        if self.websocket is not None:
            await self.websocket.send_str(json.dumps({
                "type": "settings",
                "frame_skip_pattern": self.frame_skip_pattern
            }))
            
    async def enable_dynamic_frame_skipping(self, enabled, threshold_ms=100):
        """
        Enable/disable dynamic frame skipping based on processing time.
        If processing takes longer than threshold, more frames will be skipped.
        
        Args:
            enabled: Boolean to enable/disable feature
            threshold_ms: Processing time threshold in milliseconds
        """
        self.skip_frames = enabled
        self.processing_threshold_ms = threshold_ms
        # self.log_to_file(f"Dynamic frame skipping {'enabled' if enabled else 'disabled'}")
        
        # Notify client about the changed settings
        if self.websocket is not None:
            await self.websocket.send_str(json.dumps({
                "type": "settings",
                "dynamic_frame_skipping": enabled,
                "threshold_ms": threshold_ms
            }))

    async def handle_offer_http(self, data):
        """
        Handle HTTP requests for initiating a video stream.
        
        Args:
            data: The data received from the client
        
        Returns:
            web.Response: Response containing WebSocket connection details
        """
        try:    
            if data is None:
                # self.log_to_file("No data received when streaming started")
                raise ValueError("data is null or empty")
            
            if not data.get('mode'):
                # self.log_to_file("No mode chosen when streaming started")
                raise ValueError("mode chosen is null or empty")

            params = load_parameters_for_mode(data.get('mode'))
            if params is None:
                # self.log_to_file("Parameters for mode not found")
                raise ValueError("Parameters for mode not found")
            
            if self.server.redis_client is None:
                # self.log_to_file("Redis client is null")
                raise ValueError("Redis client is null")
            
            # Generate a unique ID for this stream
            stream_id = str(uuid.uuid4())
            
            # Protocol for WebSocket connection
            protocol = "wss" if self.request.scheme == "https" else "ws"
            
            # Generate WebSocket URLs
            websocket_url = f"{protocol}://0.0.0.0:8082/ws/{stream_id}"
            websocket_url_client = f"{protocol}://{self.request.host}:9000/ws/{stream_id}"
            
            # Prepare stream configuration
            stream_config = {
                'stream_id': stream_id,
                'mode': data.get('mode'),
                'params': {
                    'feedbackA': params['A'].tolist(),
                    'controlB': params['B'].tolist(),
                    't_span': params['t'].tolist(),
                    'Ib': params['Ib'],
                    'initialCondition': params['init'],
                },
                'created_at': await self.server.redis_client.time(),
                'client_ws': websocket_url_client,
                'server_ws': websocket_url
            }
            
            # Store the stream configuration in Redis
            await self.server.redis_client.set(
                f'stream:config:{stream_id}', 
                json.dumps(stream_config)
            )
            
            # Add to the stream processing queue
            await self.server.redis_client.lpush('queue:stream_queue', stream_id)
            
            # Log the successful setup
            # self.log_to_file(f"Stream setup successful, ID: {stream_id}")
            
            # Return response to client with connection details
            return web.json_response({
                'status': 'success',
                'message': 'Stream setup complete',
                'stream_id': stream_id,
                'websocket_url': websocket_url_client
            })
            
        except Exception as e:
            # self.log_to_file(f"Error in handle_offer_http: {e}")
            return web.Response(status=500, text=f"Error setting up stream: {e}")

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
