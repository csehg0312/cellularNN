import { createSignal } from 'solid-js';
import ResponseNotification from '../components/ResponseNotification';
import UploadButton from '../components/UploadButton';
import './PhotoCNN.module.css'; // Ensure you use this file if needed for additional styles

function isLocalhost() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function PhotoCNN() {
  const [image, setImage] = createSignal(null);
  const [outputImage, setOutputImage] = createSignal(null);
  const [loading, setLoading] = createSignal(false);
  const [serverUrl, setServerUrl] = createSignal(isLocalhost() ? 'https://localhost:8082/tasks' : 'https://192.168.0.108:8082/tasks');
  const [selectedSize, setSelectedSize] = createSignal('320x240'); // default size
  const [invertSize, setInvertSize] = createSignal(false);
  const [KeepOriginalSize, setKeepOriginalSize] = createSignal(false);

  const [selectedMode, setSelectedMode] = createSignal('edge_detect_'); 
  

  // New state to handle notification
  const [responseMessage, setResponseMessage] = createSignal(null);
  const [responseStatus, setResponseStatus] = createSignal(null);

  const handleModeChange = (e) => {
    setSelectedMode(e.target.value);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSizeChange = (e) => {
    setSelectedSize(e.target.value);
  };

  const handleInvertSizeChange = (e) => {
    setInvertSize(e.target.checked);
    setKeepOriginalSize(!e.target.checked);
  };

  const handleKeepOriginalSize = (e) => {
    setKeepOriginalSize(e.target.checked);
    setInvertSize(!e.target.checked);
  };

  const closeNotification = () => {
    setResponseMessage(null);
    setResponseStatus(null);
  };

  const uploadImage = async () => {
    if (!image()) return;
    console.log('Starting upload');
    setLoading(true);
    const formData = new FormData();
    formData.append('file', image());
    formData.append('keep_original_size', KeepOriginalSize());
    formData.append('size', selectedSize());
    formData.append('invert_size', invertSize());
    formData.append('mode', selectedMode());

    try {
      const response = await fetch(serverUrl(), {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        console.log('Ready to receive');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setOutputImage(url);
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
    <div class=" text-white flex flex-col items-center p-4 min-h-screen">
      <div class="flex flex-col items-center w-full max-w-md mt-4">
        <div class="flex items-center space-x-2">
          <label class="relative inline-block cursor-pointer">
            <span class="block text-center bg-[#ff9500] text-white py-2 px-4 rounded border-2 border-[#e56e00] font-bold">
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
                class=" bg-red-500 text-white py-2 px-4 rounded text-sm border-2 border-red-700 font-bold"
                onClick={() => setImage(null)} // Function to clear the image
              >
                Clear
              </button>
            )}
          </label>
        </div>

        {image() && (
          <div class="flex flex-col items-center mb-4">
            <img src={image()} alt="Captured" class="w-full max-w-sm mb-4" />
            <UploadButton onClick={uploadImage} />
          </div>
        )}

        {outputImage() && (
          <div class="flex flex-col items-center">
            <h3 class="mb-2">Output Image:</h3>
            <img src={outputImage()} alt="Processed" class="w-full max-w-sm" />
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
          onChange={handleModeChange} // Capture mode changes
        >
          <optgroup label="Edge Detection">
            <option value="edge_detect_">Edge Detection (Él detektálás)</option>
            <option value="grayscale_edge_detect_">Grayscale Edge Detection (Szürke él detektálás)</option>
            <option value="optimal_edge_detect_">Optimal Edge Detect</option>
            <option value="edge_enhance_">Edge enhance</option>
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

          <div class="flex flex-col items-center mb-4">
            <h4 class="mb-2">Image size to use <br/> (Kimeneti kép mérete):</h4>
            <select value={selectedSize()} onChange={handleSizeChange} disabled={KeepOriginalSize() ? true : false} class="bg-black mb-2 border border-gray-300 p-2 rounded">
              <option value="320x240">320x240</option>
              <option value="640x480">640x480</option>
              <option value="960x540">960x540</option>
              <option value="1280x720">1280x720</option>
            </select>
            <label class="flex items-center mb-2">
              <input type="checkbox" id="invert_size" checked={invertSize()} onChange={handleInvertSizeChange} class="mr-2" />
              Invert the size?
            </label>
            <label class="flex items-center">
              <input type="checkbox" id="keep_original_size" checked={KeepOriginalSize()} onChange={handleKeepOriginalSize} class="mr-2" />
              Keep original size?
            </label>
          </div>
      </div>
    </div>
  );
}

export default PhotoCNN;
