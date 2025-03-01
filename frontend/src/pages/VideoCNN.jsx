import { createSignal, createEffect, onCleanup, onMount } from 'solid-js';
import ResponseNotification from '../components/ResponseNotification';
// import UploadButton from '../components/UploadButton';
import './VideoCNN.module.css';

function isLocalhost() {
  return window.location.hostname === '0.0.0.0' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function VideoCNN() {
  // Setting parameters for video processing
  const [videoStream, setVideoStream] = createSignal(null);
  const [outputImage, setOutputImage] = createSignal(null);
  const [loading, setLoading] = createSignal(false);
  const [serverUrl, setServerUrl] = createSignal(isLocalhost() ? '/offer' : '/offer');
  const [selectedMode, setSelectedMode] = createSignal('edge_detect_');
  
  // Video devices state
  const [videoInputs, setVideoInputs] = createSignal([]);
  const [selectedVideoInput, setSelectedVideoInput] = createSignal('');
  
  // State for notification and logging
  const [responseMessage, setResponseMessage] = createSignal(null);
  const [responseStatus, setResponseStatus] = createSignal(null);
  const [logMessages, setLogMessages] = createSignal([]);
  const [elapsedTime, setElapsedTime] = createSignal(null);
  const [startTime, setStartTime] = createSignal(null);
  
  // Streaming state
  const [isStreaming, setIsStreaming] = createSignal(false);
  
  // References for video and canvas elements
  let videoRef;
  let canvasRef;
  let websocket = null;
  let animationFrameId = null;

  const handleModeChange = (e) => {
    setSelectedMode(e.target.value);
  };

  const enumerateVideoDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputDevices = devices.filter(device => device.kind === 'videoinput');
      
      setVideoInputs(videoInputDevices);
      
      if (videoInputDevices.length > 0) {
        setSelectedVideoInput(videoInputDevices[0].deviceId);
      }
    } catch (err) {
      setLogMessages(prev => [...prev, `Error getting video devices: ${err.message}`]);
    }
  };

  const handleWebSocketMessage = async (event) => {
    try {
      console.log('Raw WebSocket message:', event.data);
  
      let message = event.data;
  
      // Check if the message is a string starting with "WebSocket"
      if (typeof message === 'string' && message.startsWith('WebSocket')) {
        setLogMessages(prev => [...prev, `Info message: ${message}`]);
        return;
      }
  
      // Try to parse as JSON for other messages
      let data;
      try {
        data = JSON.parse(message);
      } catch (parseError) {
        // If it's not JSON and not a WebSocket info message, log as plain text
        setLogMessages(prev => [...prev, `Plain text message: ${message}`]);
        return;
      }
  
      // Handle JSON messages
      const { type, message: msg, data: payload } = data;
      setLogMessages(prev => [...prev, `Parsed message type: ${type}`]);
  
      switch (type) {
        case 'image':
          if (typeof payload === 'string' && payload.startsWith('data:image/')) {
            const endTime = Date.now(); // Capture end time
            setElapsedTime((endTime - startTime()) / 60000); // Convert milliseconds to minutes
            setLogMessages(prev => [...prev, 'Valid image data format detected']);
  
            try {
              const mimeType = payload.split(';')[0].split(':')[1];
              setLogMessages(prev => [...prev, `MIME type: ${mimeType}`]);
  
              const base64Data = payload.split(',')[1];
              const byteCharacters = atob(base64Data);
              const byteArray = new Uint8Array(byteCharacters.length);
  
              for (let i = 0; i < byteCharacters.length; i++) {
                byteArray[i] = byteCharacters.charCodeAt(i);
              }
  
              const blob = new Blob([byteArray], { type: mimeType });
              const url = URL.createObjectURL(blob);
  
              setOutputImage(url);
              setLogMessages(prev => [...prev, 'Successfully created and set image URL']);
            } catch (blobError) {
              setLogMessages(prev => [...prev, `Error creating blob: ${blobError.message}`]);
            }
          } else {
            setLogMessages(prev => [...prev, 'Invalid image data format - missing data:image/ prefix']);
          }
          break;
  
        case 'progress':
        case 'error':
        case 'status':
          setLogMessages(prev => [...prev, `${type}: ${msg || payload}`]);
          break;
  
        default:
          setLogMessages(prev => [...prev, `Other message: ${JSON.stringify(data)}`]);
          break;
      }
    } catch (error) {
      setLogMessages(prev => [...prev, `General error handling message: ${error.message}`]);
    }
  };

  const closeNotification = () => {
    setResponseMessage(null);
    setResponseStatus(null);
  };

  const startVideoStream = async () => {
    try {
      if (isStreaming()) {
        stopVideoStream();
        return;
      }

      setLogMessages([]);
      setLoading(true);

      const constraints = {
        video: { deviceId: selectedVideoInput() ? { exact: selectedVideoInput() } : undefined }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setVideoStream(stream);
      
      if (videoRef) {
        videoRef.srcObject = stream;
        videoRef.play();
      }

      // Initialize the websocket connection
      try {
        const response = await fetch(serverUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestType: 'videoStream',
            mode: selectedMode(),
          }),
        });

        if (response.ok) {
          const jsonResponse = await response.json();
          setResponseStatus(jsonResponse.response_status);
          const wsUrl = jsonResponse.websocket_url;

          websocket = new WebSocket(wsUrl);

          websocket.onopen = function(event) {
            console.log("WebSocket is open now.");
            setStartTime(Date.now());
            setIsStreaming(true);
            startFrameCapture();
          };

          websocket.onmessage = handleWebSocketMessage;
          websocket.onclose = () => {
            setLogMessages(prev => [...prev, 'WebSocket closed.']);
            setIsStreaming(false);
          };
          websocket.onerror = (error) => {
            setLogMessages(prev => [...prev, `WebSocket error: ${error}`]);
            setIsStreaming(false);
          };

          setResponseMessage("Video stream started successfully!");
          setResponseStatus(200);
        } else {
          console.error('Failed to initialize video stream');
          setResponseMessage("Failed to initialize video stream");
          setResponseStatus(response.status);
        }
      } catch (error) {
        setResponseMessage("Error connecting to server.");
        setResponseStatus(500);
        stopVideoStream();
      } finally {
        setLoading(false);
      }
    } catch (error) {
      setLogMessages(prev => [...prev, `Error starting video: ${error.message}`]);
      setLoading(false);
    }
  };

  const stopVideoStream = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (websocket) {
      websocket.close();
      websocket = null;
    }

    if (videoStream()) {
      videoStream().getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }

    if (videoRef) {
      videoRef.srcObject = null;
    }

    setIsStreaming(false);
    setLogMessages(prev => [...prev, 'Video stream stopped.']);
  };

  const startFrameCapture = () => {
    if (!canvasRef || !videoRef || !isStreaming()) return;

    const context = canvasRef.getContext('2d');
    
    const captureAndSendFrame = () => {
      if (!isStreaming()) return;
      
      // Draw the current video frame to the canvas
      context.drawImage(videoRef, 0, 0, canvasRef.width, canvasRef.height);
      
      // Only send frame if websocket is connected
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        // Convert canvas to blob and send
        canvasRef.toBlob((blob) => {
          // Convert blob to base64 for sending over websocket
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result;
            
            // Send the frame data over WebSocket
            websocket.send(JSON.stringify({
              type: 'videoFrame',
              mode: selectedMode(),
              image: base64data
            }));
          };
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.8);  // Use JPEG with 80% quality for better performance
      }
      
      // Request the next frame
      animationFrameId = requestAnimationFrame(captureAndSendFrame);
    };
    
    // Start the capture loop
    animationFrameId = requestAnimationFrame(captureAndSendFrame);
  };

  onMount(() => {
    enumerateVideoDevices();
  });

  onCleanup(() => {
    stopVideoStream();
  });

  return (
    <div class="text-white flex flex-col items-center p-4 min-h-screen">
      <div class="flex flex-col items-center w-full max-w-md mt-4">
        <h2 class="text-2xl font-bold mb-4">Video CNN Processing</h2>
        
        {/* Video device selection - only shown when not streaming */}
        {!isStreaming() && (
          <div class="mb-4 w-full">
            <label class="block mb-2">Video Input Device:</label>
            <select
              value={selectedVideoInput()}
              onChange={(e) => setSelectedVideoInput(e.target.value)}
              class="bg-black w-full border border-gray-300 p-2 rounded"
            >
              {videoInputs().map((device) => (
                <option value={device.deviceId}>
                  {device.label || `Video Device ${device.deviceId.substr(0, 5)}`}
                </option>
              ))}
            </select>
          </div>
        )}
        
        {/* Start/Stop button */}
        <button
          onClick={startVideoStream}
          class={`${isStreaming() ? 'bg-red-500 border-red-700' : 'bg-[#ff9500] border-[#e56e00]'} text-white py-2 px-4 rounded border-2 font-bold mb-4`}
        >
          {isStreaming() ? "Stop Video" : "Start Video"}
        </button>
        
        {/* Video display */}
        <div class="flex flex-col md:flex-row w-full gap-4">
          <div class="flex-1">
            <h3 class="mb-2">Input Video:</h3>
            <video 
              ref={videoRef} 
              width="320" 
              height="240" 
              autoplay 
              playsinline 
              muted 
              class="bg-black border border-gray-700 w-full"
            ></video>
            <canvas 
              ref={canvasRef} 
              width="320" 
              height="240" 
              class="hidden"
            ></canvas>
          </div>
          
          {outputImage() && (
            <div class="flex-1">
              <h3 class="mb-2">Processed Output:</h3>
              <img 
                src={outputImage()} 
                alt="Processed Video Frame" 
                class="bg-black border border-gray-700 w-full" 
                style={{ height: '240px', 'object-fit': 'contain' }}
              />
            </div>
          )}
        </div>
        
        {/* Log display */}
        <div class="bg-gray-800 p-3 mt-4 w-full max-w-md overflow-y-auto h-32 border border-gray-600 rounded">
          <h3 class="text-sm font-bold">Logs:</h3>
          <div class="text-xs whitespace-pre-wrap">{logMessages().join('\n')}</div>
        </div>
        
        {elapsedTime() !== null && (
          <div class="mt-4 text-sm">
            <strong>Elapsed Time:</strong> {elapsedTime()} minute/-s
          </div>
        )}
      </div>
      
      {/* Notification component */}
      {responseMessage() && (
        <ResponseNotification
          message={responseMessage()}
          status={responseStatus()}
          onClose={closeNotification}
        />
      )}
      
      {/* Mode selection dropdown - only shown when not streaming */}
      {!isStreaming() && (
        <div class="flex flex-col items-center mt-6 w-full max-w-md">
          <h3 class="mb-2">Processing Mode:</h3>
          <select
            name="settings"
            id="settings"
            class="bg-black mb-4 border border-gray-300 p-2 rounded w-full sm:w-40"
            value={selectedMode()}
            onChange={handleModeChange}
          >
            <optgroup label="Edge Detection">
              <option value="edge_detect_">Edge Detection (Él detektálás)</option>
              <option value="grayscale_edge_detect_">Grayscale Edge Detection (Szürke él detektálás)</option>
              <option value="optimal_edge_detect_">Optimal Edge Detect</option>
              <option value="edge_enhance_">Edge enhance</option>
              <option value="laplacian_edge_">Laplacian Edge Detect</option>
            </optgroup>
            <optgroup label="Line Detection">
              <option value="diagonal_line_detect_">Diagonal line detection</option>
              <option value="horizontal_line_detect_">Horizontal Line Detect</option>
              <option value="vertical_line_detect_">Vertical Line Detect</option>
            </optgroup>
            <optgroup label="Image Processing">
              <option value="inversion_">Inversion (Inverz)</option>
              <option value="noise_removal_">Noise removal</option>
              <option value="sharpen_">Sharpen</option>
              <option value="halftone_">Halftone</option>
              <option value="diffusion_">Diffusion</option>
            </optgroup>
            <optgroup label="Object Detection">
              <option value="corner_detect_">Corner detection (Sarok detektálás)</option>
              <option value="blob_detect_">Blob detect</option>
              <option value="texture_segment_">Texture segmentation</option>
            </optgroup>
            <optgroup label="Motion and Shadow">
              <option value="motion_detect_">Motion detection</option>
              <option value="shadow_detect_">Shadow Detection</option>
            </optgroup>
            <optgroup label="Other">
              <option value="connected_comp_">Connected Components</option>
              <option value="saved_">Saved</option>
            </optgroup>
          </select>
        </div>
      )}
    </div>
  );
}

export default VideoCNN;
