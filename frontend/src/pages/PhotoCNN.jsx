import { createSignal } from 'solid-js';
import ResponseNotification from '../components/ResponseNotification';
import UploadButton from '../components/UploadButton';
import MatrixVisualizer from '../components/MatrixVisualizer';
import ImageViewer from '../components/ImageViewer';
import { modeOptions } from "../assets/settings";
import './PhotoCNN.module.css'; // Ensure you use this file if needed for additional styles

function isLocalhost() {
  return window.location.hostname === '0.0.0.0' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function PhotoCNN() {

  // Setting parameters:
  // image - The image user uploads
  // outputImage - The one is received back from the worker
  // loading - responsible for animation
  // serverUrl - Link to the server 
  const [image, setImage] = createSignal(null);
  const [outputImage, setOutputImage] = createSignal(null);
  const [loading, setLoading] = createSignal(false);
  const [serverUrl, setServerUrl] = createSignal(isLocalhost() ? 'http://localhost:9000/tasks' : '192.168.0.102:9000/tasks');
  const [selectedMode, setSelectedMode] = createSignal('edge_detect_'); 

  // New state to handle notification
  const [responseMessage, setResponseMessage] = createSignal(null);
  const [responseStatus, setResponseStatus] = createSignal(null);
  const [logMessages, setLogMessages] = createSignal([]);
  const [elapsedTime, setElapsedTime] = createSignal(null); // New state for elapsed time
  const [startTime, setStartTime] = createSignal(null);

  // New state for matrix data
  const [matrixData, setMatrixData] = createSignal(null);

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
        case 'matrix_data':
          // Handle matrix data
          setLogMessages(prev => [...prev, 'Matrix data received']);
          if (payload && typeof payload === 'object') {
            setMatrixData(payload);
            // Dispatch custom event for MatrixVisualizer
            const event = new CustomEvent('serverDataReceived', { detail: payload });
            window.dispatchEvent(event);
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

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;

    if (files.length > 0) {
      const file = files[0];
      const validTypes = ["image/png", "image/jpeg", "image/gif"]; // Specify valid file types

      if (validTypes.includes(file.type)) {
        const reader = new FileReader();
        reader.onload = () => setImage(reader.result);
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

  const uploadImage = async () => {
    if (!image()) return;
    console.log('Starting upload');
    setLogMessages([]);
    setLoading(true);

    // Create a JSON object to send
    const jsonData = {
      image: image(),
      mode: selectedMode(),
    };

    try {
      const response = await fetch(serverUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', // Set the content type to JSON
        },
        body: JSON.stringify(jsonData), // Convert the JSON object to a string
      });

      if (response.ok) {
        console.log('Ready to receive');

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
        }
        const wsUrl = jsonResponse.websocket_url;

        const socket = new WebSocket(wsUrl);

        socket.onopen = function(event) {
          console.log("WebSocket is open now.");
          setStartTime(Date.now());
        };

        socket.onmessage = handleWebSocketMessage;

        
        socket.onclose = () => setLogMessages([...logMessages(), 'WebSocket closed.']);
        socket.onerror = (error) => setLogMessages([...logMessages(), `WebSocket error: ${error}`]);

        setResponseMessage("Upload successful!");
        setResponseStatus(200); // Successful status
      } else {
        console.error('Failed to upload image');
        setResponseMessage("Failed to upload image");
        setResponseStatus(response.status);
      }
    } catch (error) {
      setResponseMessage("Error uploading to server.");
      setResponseStatus(500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="text-white flex flex-col items-center p-4 min-h-screen">
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
                onClick={() => setImage(null)} // Function to clear the image
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

        {/* Replace the basic image display with ImageViewer component */}
        <ImageViewer
          inputImage={image()}
          outputImage={outputImage()}
        />

        {/* Add the MatrixVisualizer component */}
        <MatrixVisualizer />

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

      {/* Render ResponseNotification */}
      {responseMessage() && (
        <ResponseNotification
          message={responseMessage()}
          status={responseStatus()}
          onClose={closeNotification} // Pass the close function
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
