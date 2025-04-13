import { createSignal, createEffect } from 'solid-js';
import ResponseNotification from '../components/ResponseNotification';
import UploadButton from '../components/UploadButton';
import MatrixVisualizer from '../components/MatrixVisualizer';
import ImageViewer from '../components/ImageViewer';
import { modeOptions } from "../assets/settings";
import './PhotoCNN.module.css';

function isLocalhost() {
  return window.location.hostname === '0.0.0.0' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function PhotoCNN() {
  const [image, setImage] = createSignal(null);
  const [outputImage, setOutputImage] = createSignal(null);
  const [loading, setLoading] = createSignal(false);
  const [serverUrl, setServerUrl] = createSignal(isLocalhost() ? 'http://localhost:9000/tasks' : '192.168.0.102:9000/tasks');
  const [selectedMode, setSelectedMode] = createSignal('edge_detect_');

  // Notification states
  const [responseMessage, setResponseMessage] = createSignal(null);
  const [responseStatus, setResponseStatus] = createSignal(null);
  const [logMessages, setLogMessages] = createSignal([]);
  const [elapsedTime, setElapsedTime] = createSignal(null);
  const [startTime, setStartTime] = createSignal(null);
  
  // New notification states for image processing
  const [imageNotification, setImageNotification] = createSignal(null);
  const [processingStage, setProcessingStage] = createSignal(null);
  const [processingDetails, setProcessingDetails] = createSignal({});
  const [showProcessingNotification, setShowProcessingNotification] = createSignal(false);

  const [matrixData, setMatrixData] = createSignal(null);

  // Auto-hide image notification after 5 seconds
  createEffect(() => {
    if (imageNotification()) {
      const timer = setTimeout(() => {
        setImageNotification(null);
        setShowProcessingNotification(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  });

  const handleModeChange = (e) => {
    setSelectedMode(e.target.value);
  };

  const handleWebSocketMessage = async (event) => {
    try {
      console.log('Raw WebSocket message:', event.data);
  
      let message = event.data;
  
      // Check if the message is a string starting with "WebSocket"
      if (typeof message === 'string' && message.startsWith('WebSocket')) {
        setLogMessages(prev => [...prev, `Info message: ${message}`]);
        // Update processing notification
        setProcessingStage('Connected');
        setImageNotification('WebSocket connection established');
        setShowProcessingNotification(true);
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
            const endTime = Date.now();
            const processingTime = (endTime - startTime()) / 1000; // Convert to seconds
            setElapsedTime(processingTime / 60); // Convert seconds to minutes
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
              
              // Show notification about successful image processing
              setProcessingStage('Complete');
              setImageNotification(`Image processing complete! (${processingTime.toFixed(2)} seconds)`);
              setProcessingDetails(prev => ({
                ...prev,
                mimeType,
                processingTime: processingTime.toFixed(2),
                mode: selectedMode()
              }));
              setShowProcessingNotification(true);
            } catch (blobError) {
              setLogMessages(prev => [...prev, `Error creating blob: ${blobError.message}`]);
              setImageNotification('Error processing image output');
              setShowProcessingNotification(true);
            }
          } else {
            setLogMessages(prev => [...prev, 'Invalid image data format - missing data:image/ prefix']);
            setImageNotification('Invalid image data received');
            setShowProcessingNotification(true);
          }
          break;
          
        case 'matrix_data':
          // Handle matrix data
          setLogMessages(prev => [...prev, 'Matrix data received']);
          if (payload && typeof payload === 'object') {
            setMatrixData(payload);
            // Dispatch custom event for MatrixVisualizer
            const event = new CustomEvent('serverDataReceived', { detail: payload });
            window.dispatchEvent(event);
            
            // Update processing notification
            setProcessingStage('Matrix');
            setImageNotification('Matrix data received - analyzing image');
            setProcessingDetails(prev => ({
              ...prev,
              matrixSize: payload.tempA ? `${payload.tempA.length}x${payload.tempA[0]?.length || 0}` : 'Unknown',
              filterType: selectedMode().replace('_', ' ')
            }));
            setShowProcessingNotification(true);
          }
          break;
  
        case 'progress':
          setLogMessages(prev => [...prev, `${type}: ${msg || payload}`]);
          // Update processing notification with progress
          setProcessingStage('Processing');
          setImageNotification(`Processing: ${msg || payload}`);
          setShowProcessingNotification(true);
          break;
          
        case 'error':
          setLogMessages(prev => [...prev, `${type}: ${msg || payload}`]);
          setImageNotification(`Error: ${msg || payload}`);
          setShowProcessingNotification(true);
          break;
          
        case 'status':
          setLogMessages(prev => [...prev, `${type}: ${msg || payload}`]);
          // Update processing status
          setProcessingStage('Status');
          setImageNotification(`Status update: ${msg || payload}`);
          setShowProcessingNotification(true);
          break;
  
        default:
          setLogMessages(prev => [...prev, `Other message: ${JSON.stringify(data)}`]);
          break;
      }
    } catch (error) {
      setLogMessages(prev => [...prev, `General error handling message: ${error.message}`]);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImage(reader.result);
        // Show notification about loaded image
        setImageNotification(`Image loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
        setProcessingDetails({
          fileName: file.name,
          fileSize: (file.size / 1024).toFixed(1),
          fileType: file.type
        });
        setShowProcessingNotification(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;

    if (files.length > 0) {
      const file = files[0];
      const validTypes = ["image/png", "image/jpeg", "image/gif"];

      if (validTypes.includes(file.type)) {
        const reader = new FileReader();
        reader.onload = () => {
          setImage(reader.result);
          // Show notification about loaded image
          setImageNotification(`Image loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
          setProcessingDetails({
            fileName: file.name,
            fileSize: (file.size / 1024).toFixed(1),
            fileType: file.type
          });
          setShowProcessingNotification(true);
        };
        reader.readAsDataURL(file);
      } else {
        setResponseMessage("Invalid file type. Please upload a PNG, JPEG, or GIF image.");
        setResponseStatus(400);
      }
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const closeNotification = () => {
    setResponseMessage(null);
    setResponseStatus(null);
  };

  const closeImageNotification = () => {
    setImageNotification(null);
    setShowProcessingNotification(false);
  };

  const uploadImage = async () => {
    if (!image()) return;
    console.log('Starting upload');
    setLogMessages([]);
    setLoading(true);
    
    // Show notification about upload start
    setImageNotification('Starting image processing');
    setProcessingStage('Uploading');
    setShowProcessingNotification(true);

    // Create a JSON object to send
    const jsonData = {
      image: image(),
      mode: selectedMode(),
    };

    try {
      setImageNotification(`Uploading image with mode: ${selectedMode()}`);
      setShowProcessingNotification(true);
      
      const response = await fetch(serverUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonData),
      });

      if (response.ok) {
        console.log('Ready to receive');
        
        // Update notification
        setImageNotification('Upload successful - waiting for processing');
        setProcessingStage('Connected');
        setShowProcessingNotification(true);

        const jsonResponse = await response.json();
        setResponseStatus(jsonResponse.response_status);
        
        // Check if response contains matrix data directly
        if (jsonResponse.tempA && jsonResponse.tempB) {
          // Store the matrix data
          const matrixPayload = {
            tempA: jsonResponse.tempA,
            tempB: jsonResponse.tempB,
            Ib: jsonResponse.Ib,
            start: jsonResponse.start,
            end: jsonResponse.end
          };
          setMatrixData(matrixPayload);
          // Dispatch event for the MatrixVisualizer component
          const event = new CustomEvent('serverDataReceived', { detail: matrixPayload });
          window.dispatchEvent(event);

          setLogMessages(prev => [...prev, 'Matrix data received directly in response']);
          
          // Update notification
          setImageNotification('Matrix data received directly - analyzing image');
          setProcessingStage('Matrix');
          setProcessingDetails(prev => ({
            ...prev,
            matrixSize: matrixPayload.tempA ? `${matrixPayload.tempA.length}x${matrixPayload.tempA[0]?.length || 0}` : 'Unknown'
          }));
          setShowProcessingNotification(true);
        }
        
        const wsUrl = jsonResponse.websocket_url;

        const socket = new WebSocket(wsUrl);

        socket.onopen = function(event) {
          console.log("WebSocket is open now.");
          setStartTime(Date.now());
          setImageNotification('WebSocket connected - processing started');
          setProcessingStage('Processing');
          setShowProcessingNotification(true);
        };

        socket.onmessage = handleWebSocketMessage;

        socket.onclose = () => {
          setLogMessages(prev => [...prev, 'WebSocket closed.']);
          if (!outputImage()) {
            setImageNotification('Connection closed without receiving image');
            setShowProcessingNotification(true);
          }
        };
        
        socket.onerror = (error) => {
          setLogMessages(prev => [...prev, `WebSocket error: ${error}`]);
          setImageNotification('Error in WebSocket connection');
          setShowProcessingNotification(true);
        };

        setResponseMessage("Upload successful!");
        setResponseStatus(200);
      } else {
        console.error('Failed to upload image');
        setResponseMessage("Failed to upload image");
        setResponseStatus(response.status);
        setImageNotification('Server rejected the upload');
        setShowProcessingNotification(true);
      }
    } catch (error) {
      setResponseMessage("Error uploading to server.");
      setResponseStatus(500);
      setImageNotification('Network error during upload');
      setShowProcessingNotification(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="text-white flex flex-col items-center p-4 min-h-screen">
      {/* New Image Processing Notification */}
      {showProcessingNotification() && (
        <div class="fixed top-4 right-4 bg-gray-800 border-l-4 border-blue-500 text-white p-4 rounded shadow-lg max-w-sm z-50 transition-opacity duration-300 opacity-90">
          <div class="flex justify-between">
            <h3 class="font-bold mb-2">{processingStage() || 'Processing'}</h3>
            <button onClick={closeImageNotification} class="text-white hover:text-gray-300">×</button>
          </div>
          <p class="mb-2">{imageNotification()}</p>
          
          {Object.keys(processingDetails()).length > 0 && (
            <div class="text-xs bg-gray-900 p-2 rounded mt-2">
              {Object.entries(processingDetails()).map(([key, value]) => (
                <div class="flex justify-between">
                  <span class="font-semibold">{key}:</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div class="flex flex-col items-center w-full max-w-md mt-4">
        <div class="flex items-center space-x-2">
          <label class="relative inline-block cursor-pointer">
            <span class ="block text-center bg-[#ff9500] text-white py-2 px-4 rounded border-2 border-[#e56e00] font-bold">
              {image() === null ? "Kép feltöltése" : "Kép módosítása"}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleImageChange}
              class="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
            />
          </label>
          <label class="relative inline-block cursor-pointer">
            {image() && (
              <button
                class="bg-red-500 text-white py-2 px-4 rounded text-sm border-2 border-red-700 font-bold"
                onClick={() => {
                  setImage(null);
                  setOutputImage(null);
                  setImageNotification('Image cleared');
                  setProcessingDetails({});
                  setShowProcessingNotification(true);
                }}
              >
                Clear
              </button>
            )}
          </label>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          style={{
            border: "2px dashed #ccc",
            padding: "20px",
            textAlign: "center",
            cursor: "pointer",
            marginTop: "20px",
            width: "100%",
          }}
        >
           <p>{image() === null ? "Húzzon ide egy képet, vagy kattintson fel a feltöltéshez" : "Dobjon ide egy másik képet, hogy helyettesítse azt."}</p>
        </div>

        {image() && (
          <div class="flex flex-col items-center mb-4">
            <img src={image()} alt="Captured" class="w-full max-w-sm mb-4" />
            <UploadButton onClick={uploadImage} />
          </div>
        )}

        {/* Image Viewer Component */}
        <ImageViewer
          inputImage={image()}
          outputImage={outputImage()}
        />

        {/* Matrix Visualizer Component */}
        <MatrixVisualizer />

        {/* Processing Information */}
        {outputImage() && processingDetails().processingTime && (
          <div class="bg-gray-700 p-4 mt-4 w-full rounded">
            <h3 class="text-sm font-bold mb-2">Processing Details:</h3>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div>Mode:</div>
              <div>{selectedMode().replace('_', ' ')}</div>
              
              <div>Processing Time:</div>
              <div>{processingDetails().processingTime} seconds</div>
              
              {processingDetails().matrixSize && (
                <>
                  <div>Matrix Size:</div>
                  <div>{processingDetails().matrixSize}</div>
                </>
              )}
            </div>
          </div>
        )}

        <div class="bg-gray-800 p-3 mt-4 w-full max-w-md overflow-y-auto h-32 border border-gray-600 rounded">
          <h3 class="text-sm font-bold">Logs:</h3>
          <div class="text-xs whitespace-pre-wrap">{logMessages().join('\n')}</div>
        </div>

        {elapsedTime() !== null && (
          <div class="mt-4 text-sm">
            <strong>Processing Time:</strong> {elapsedTime().toFixed(2)} minute(s)
          </div>
        )}
      </div>

      {/* Response Notification */}
      {responseMessage() && (
        <ResponseNotification
          message={responseMessage()}
          status={responseStatus()}
          onClose={closeNotification}
        />
      )}
      
      <div class="flex flex-col items-center mt-6 w-full max-w-md">
        <h3 class="mb-2">Mode (Mód):</h3>
        <select
          name="settings"
          id="settings"
          class="bg-black mb-4 border border-gray-300 p-2 rounded w-full sm:w-40"
          value={selectedMode()}
          onChange={handleModeChange}
        >
          {modeOptions.map((group) => (
            <optgroup label={group.groupName}>
              {group.options.map((option) => (
                <option value={option.value}>{option.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}

export default PhotoCNN;
