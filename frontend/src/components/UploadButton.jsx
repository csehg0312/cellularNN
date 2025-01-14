import animationData from '../assets/upload-to-success.json';
import { onMount } from 'solid-js';
import lottie from 'lottie-web';

const UploadButton = (props) => {
  let animationContainerRef;
  let animation;

  onMount(() => {
    animation = lottie.loadAnimation({
      container: animationContainerRef,
      animationData,
      loop: false,
      autoplay: false,
      rendererSettings: {
        scale: 0.5,
      },
    });

    animation.addEventListener('complete', () => {
      console.log('Animation complete!');
      animation.destroy();
      animationContainerRef.innerHTML = '';
      animation = lottie.loadAnimation({
        container: animationContainerRef,
        animationData,
        loop: false,
        autoplay: false,
        rendererSettings: {
          scale: 0.5,
        },
      });
      animationContainerRef.style.visibility = 'hidden';
    });
  });

  const handleAnimation = () => {
    animation.play();
    animationContainerRef.style.visibility = 'visible';
    if (props.onClick) {
      props.onClick();
    }
  };

  return (
    <div class="flex flex-col items-center">
      <button
        type="button"
        style={{ 
          "background-color": "#ff9500",
          "border": '2px solid #e56e00',
          "color": '#f0f0f0',
          "padding": '10px 20px',
          "border-radius": '10px',
          "font-weight" : 'bold',
          "cursor":'pointer',
          "transition": 'backgrouind-color 0.3s ease',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#e56e00'} // Darker tangerine on hover
        onMouseLeave={(e) => e.target.style.backgroundColor = '#ff9500'} // Revert back to original color
        class="mt-6 md:mt-10"
        // class="text-white font-bold py-2 px-4 rounded mt-4 transition-colors duration-300 hover:bg-orange-600"
        onClick={handleAnimation}
      >
        Upload File
      </button>
      <div
        style={{
          width: '100px',
          height: '100px',
          visibility: 'hidden',
        }}
        ref={(el) => (animationContainerRef = el)}
      />
    </div>
  );
};

export default UploadButton;
