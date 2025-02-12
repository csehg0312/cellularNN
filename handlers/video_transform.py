import cv2
from av import VideoFrame
from aiortc import MediaStreamTrack
import asyncio
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from functools import lru_cache
import time

class VideoTransformTrack(MediaStreamTrack):
    """
    An enhanced video stream track that transforms frames with optimization techniques.
    """
    kind = "video"

    def __init__(self, track, transform, buffer_size=30, max_workers=3):
        super().__init__()
        self.track = track
        self.transform = transform
        
        # Frame buffer for smoothing
        self.frame_buffer = deque(maxlen=buffer_size)
        
        # Thread pool for parallel processing
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        
        # Processing time tracking
        self.processing_times = deque(maxlen=10)
        
        # Adaptive quality control
        self.quality_scale = 1.0
        self.target_processing_time = 1.0/30  # target 30 fps
        
        # Frame skipping control
        self.frame_count = 0
        self.skip_threshold = 5  # process every nth frame when overloaded

    @lru_cache(maxsize=128)
    def _bilateral_filter_cached(self, image_hash):
        """Cache bilateral filter results for similar frames"""
        # Convert hash back to image
        img = np.frombuffer(image_hash, dtype=np.uint8).reshape((self.last_shape))
        return cv2.bilateralFilter(img, 9, 9, 7)

    def _get_frame_hash(self, img):
        """Create a hash for frame caching"""
        return img.tobytes()

    async def _process_cartoon(self, img):
        """Optimized cartoon effect processing"""
        start_time = time.time()
        
        # Adaptive downscaling based on processing load
        if self.processing_times and np.mean(self.processing_times) > self.target_processing_time:
            self.quality_scale = max(0.5, self.quality_scale - 0.1)
        else:
            self.quality_scale = min(1.0, self.quality_scale + 0.1)
        
        if self.quality_scale < 1.0:
            new_size = (int(img.shape[1] * self.quality_scale), int(img.shape[0] * self.quality_scale))
            img = cv2.resize(img, new_size)

        # Parallel processing for color and edges
        loop = asyncio.get_event_loop()
        
        async def process_color():
            img_color = cv2.pyrDown(cv2.pyrDown(img))
            self.last_shape = img_color.shape
            frame_hash = self._get_frame_hash(img_color)
            img_color = await loop.run_in_executor(
                self.executor,
                self._bilateral_filter_cached,
                frame_hash
            )
            return cv2.pyrUp(cv2.pyrUp(img_color))

        async def process_edges():
            img_edges = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
            img_edges = await loop.run_in_executor(
                self.executor,
                cv2.adaptiveThreshold,
                cv2.medianBlur(img_edges, 7),
                255,
                cv2.ADAPTIVE_THRESH_MEAN_C,
                cv2.THRESH_BINARY,
                9,
                2,
            )
            return cv2.cvtColor(img_edges, cv2.COLOR_GRAY2RGB)

        # Run color and edge processing concurrently
        img_color, img_edges = await asyncio.gather(
            process_color(),
            process_edges()
        )

        # Combine results
        result = cv2.bitwise_and(img_color, img_edges)
        
        # Restore original size if scaled
        if self.quality_scale < 1.0:
            result = cv2.resize(result, (img.shape[1], img.shape[0]))

        # Track processing time
        processing_time = time.time() - start_time
        self.processing_times.append(processing_time)

        return result

    async def recv(self):
        frame = await self.track.recv()
        self.frame_count += 1

        # Frame skipping when overloaded
        if (np.mean(self.processing_times) > self.target_processing_time * 2 and 
            self.frame_count % self.skip_threshold != 0):
            return frame

        if self.transform == "cartoon":
            img = frame.to_ndarray(format="bgr24")
            
            # Process frame
            try:
                img = await self._process_cartoon(img)
                
                # Add to buffer for frame interpolation
                self.frame_buffer.append(img)
                
                # Use frame interpolation if buffer is full
                if len(self.frame_buffer) == self.frame_buffer.maxlen:
                    img = np.mean([self.frame_buffer[-2], img], axis=0).astype(np.uint8)
                
            except Exception as e:
                print(f"Processing error: {e}")
                return frame

            # rebuild a VideoFrame, preserving timing information
            new_frame = VideoFrame.from_ndarray(img, format="bgr24")
            new_frame.pts = frame.pts
            new_frame.time_base = frame.time_base
            return new_frame

        elif self.transform == "edges":
            # Implement similar optimizations for edges transform
            img = frame.to_ndarray(format="bgr24")
            
            # Adaptive quality control
            if self.quality_scale < 1.0:
                new_size = (int(img.shape[1] * self.quality_scale), int(img.shape[0] * self.quality_scale))
                img = cv2.resize(img, new_size)
            
            loop = asyncio.get_event_loop()
            img = await loop.run_in_executor(
                self.executor,
                lambda: cv2.cvtColor(cv2.Canny(img, 100, 200), cv2.COLOR_GRAY2BGR)
            )
            
            if self.quality_scale < 1.0:
                img = cv2.resize(img, (frame.width, frame.height))

            new_frame = VideoFrame.from_ndarray(img, format="bgr24")
            new_frame.pts = frame.pts
            new_frame.time_base = frame.time_base
            return new_frame

        elif self.transform == "rotate":
            # Optimize rotation transform
            img = frame.to_ndarray(format="bgr24")
            
            rows, cols, _ = img.shape
            M = cv2.getRotationMatrix2D((cols / 2, rows / 2), frame.time * 45, 1)
            
            loop = asyncio.get_event_loop()
            img = await loop.run_in_executor(
                self.executor,
                cv2.warpAffine,
                img, M, (cols, rows)
            )

            new_frame = VideoFrame.from_ndarray(img, format="bgr24")
            new_frame.pts = frame.pts
            new_frame.time_base = frame.time_base
            return new_frame
            
        else:
            return frame

    async def stop(self):
        """Clean up resources"""
        self.executor.shutdown(wait=True)
        await super().stop()