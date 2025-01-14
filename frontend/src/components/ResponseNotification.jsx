function ResponseNotification({ message, status, onClose }) {
    const getStatusColor = () => {
      if (status === 200) return 'bg-green-500';
      if (status >= 400 && status < 500) return 'bg-yellow-500';
      return 'bg-red-500';
    };
  
    return (
        <div class={`p-4 sm:p-6 rounded ${getStatusColor()} text-white mb-4 max-w-full sm:max-w-lg`}>
          <div class="flex justify-between items-center">
            <p class="text-sm sm:text-base">{message}</p>
            <button onClick={onClose} class="ml-4 text-2xl sm:text-3xl font-bold">
              &times;
            </button>
          </div>
        </div>
      );
}
  
  export default ResponseNotification;
  
            