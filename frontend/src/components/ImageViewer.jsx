import { createSignal, Show } from 'solid-js';
import './ImageViewer.module.css';

const ImageViewer = (props) => {
  const [isFullscreen, setIsFullscreen] = createSignal(false);
  const [activeImage, setActiveImage] = createSignal(null);

  // Function to open fullscreen view
  const openFullscreen = (imageSrc) => {
    setActiveImage(imageSrc);
    setIsFullscreen(true);
    // Prevent background scrolling when fullscreen is active
    document.body.style.overflow = 'hidden';
  };

  // Function to close fullscreen view
  const closeFullscreen = () => {
    setIsFullscreen(false);
    // Re-enable scrolling
    document.body.style.overflow = 'auto';
  };

  // Handle key press events (Escape to close fullscreen)
  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && isFullscreen()) {
      closeFullscreen();
    }
  };

  return (
    <div class="image-viewer" onKeyDown={handleKeyDown}>
      {/* Regular image display */}
      <div class="image-container grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {/* Input Image */}
        <Show when={props.inputImage}>
          <div class="relative rounded overflow-hidden border-2 border-gray-700 group">
            <img 
              src={props.inputImage} 
              alt="Input" 
              class="w-full object-contain max-h-64" 
            />
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <button 
                onClick={() => openFullscreen(props.inputImage)}
                class="bg-gray-800 text-white p-2 rounded-full hover:bg-gray-700"
                aria-label="View fullscreen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 0h-4m4 0l-5-5" />
                </svg>
              </button>
            </div>
            <div class="absolute top-0 left-0 bg-gray-900 bg-opacity-70 text-white px-2 py-1 text-sm">
              Input
            </div>
          </div>
        </Show>
        
        {/* Output Image */}
        <Show when={props.outputImage}>
          <div class="relative rounded overflow-hidden border-2 border-gray-700 group">
            <img 
              src={props.outputImage} 
              alt="Output" 
              class="w-full object-contain max-h-64" 
            />
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <button 
                onClick={() => openFullscreen(props.outputImage)}
                class="bg-gray-800 text-white p-2 rounded-full hover:bg-gray-700"
                aria-label="View fullscreen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 0h-4m4 0l-5-5" />
                </svg>
              </button>
            </div>
            <div class="absolute top-0 left-0 bg-gray-900 bg-opacity-70 text-white px-2 py-1 text-sm">
              Output
            </div>
          </div>
        </Show>
      </div>

      {/* Fullscreen overlay */}
      <Show when={isFullscreen()}>
        <div class="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
          <div class="max-w-full max-h-full p-4">
            <img 
              src={activeImage()} 
              alt="Fullscreen view" 
              class="max-w-full max-h-[90vh] object-contain" 
            />
          </div>
          <button 
            onClick={closeFullscreen}
            class="absolute top-4 right-4 bg-gray-800 text-white p-2 rounded-full hover:bg-gray-700"
            aria-label="Close fullscreen"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-gray-800 px-3 py-2 rounded-full opacity-70">
            Press ESC to close
          </div>
        </div>
      </Show>
    </div>
  );
};

export default ImageViewer;
