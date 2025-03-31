import { createSignal, createEffect, Show } from 'solid-js';
import './MatrixVisualizer.module.css';

function MatrixVisualizer() {
  // State for matrices, timespan, and bias
  const [matrixA, setMatrixA] = createSignal(null);
  const [matrixB, setMatrixB] = createSignal(null);
  const [ibBias, setIbBias] = createSignal(null);
  const [timeStart, setTimeStart] = createSignal(null);
  const [timeEnd, setTimeEnd] = createSignal(null);
  const [timeElapsed, setTimeElapsed] = createSignal(null);
  const [showVisualizer, setShowVisualizer] = createSignal(false);
  const [error, setError] = createSignal(null);

  // Function to handle the server response data
  const processMatrixData = (data) => {
    try {
      // Extract data from the response
      const { tempA, tempB, Ib, start, end } = data;

      setMatrixA(tempA);
      setMatrixB(tempB);
      setIbBias(Ib);
      setTimeStart(start);
      setTimeEnd(end);
      setTimeElapsed(end - start);
      setShowVisualizer(true);
      setError(null);
    } catch (err) {
      console.error('Error processing matrix data:', err);
      setError('Failed to process matrix data. Please check the console for details.');
    }
  };
   // Listen for custom events from the main component
  createEffect(() => {
    const handleServerData = (event) => {
      const { detail } = event;
      if (detail && typeof detail === 'object') {
        processMatrixData(detail);
      }
    };

    window.addEventListener('serverDataReceived', handleServerData);

    // Cleanup
    return () => {
      window.removeEventListener('serverDataReceived', handleServerData);
    };
  });
  // Function to render a matrix as a table
  const renderMatrix = (matrix, title) => {
    if (!matrix || !Array.isArray(matrix) || matrix.length === 0) return null;

    return (
      <div class="matrix-container">
        <h3 class="text-lg font-bold mb-2">{title}</h3>
        <div class="overflow-x-auto">
          <table class="border-collapse border border-gray-500">
            <tbody>
              {matrix.map((row, rowIdx) => (
                <tr>
                  {Array.isArray(row) ?
                    row.map((cell, cellIdx) => (
                      <td class="border border-gray-600 p-2 text-center" title={`Value: ${cell}`}>
                        {typeof cell === 'number' ? cell.toFixed(2) : cell}
                      </td>
                    )) :
                    <td class="border border-gray-600 p-2 text-center" title={`Value: ${row}`}>
                      {typeof row === 'number' ? row.toFixed(2) : row}
                    </td>
                  }
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };
  return (
    <div class="matrix-visualizer bg-gray-800 p-4 rounded-lg mt-6 w-full max-w-md text-white">
      <h2 class="text-xl font-bold mb-4">Mátrixok és feldolgozási paraméterek</h2>

      <Show when={error()}>
        <div class="bg-red-600 p-3 rounded mb-4">
          {error()}
        </div>
      </Show>

      <Show when={showVisualizer()}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderMatrix(matrixA(), 'Visszacsatolási mátrix')}
          {renderMatrix(matrixB(), 'Kontroll mátrix')}
        </div>

        <div class="mt-6 p-3 bg-gray-700 rounded">
          <div class="mb-2">
            <span class="font-bold">Ib (bejövő áramerősség):</span> {ibBias() !== null ? ibBias().toFixed(4) : 'N/A'}
          </div>
          <div class="mb-2">
            <span class="font-bold">T idő (A vizsgált időpillanat):</span> {timeStart() !== null ? timeStart().toFixed(2) : 'N/A'} to {timeEnd() !== null ? timeEnd().toFixed(2) : 'N/A'}
          <div>
            <span class="font-bold">Adatok szerverre érkezése és válasz</span> {timeElapsed() !== null ? timeElapsed().toFixed(2) : 'N/A'} seconds
          </div>
        </div>
      </Show>

      <Show when={!showVisualizer()}>
        <div class="text-center p-6 bg-gray-700 rounded">
          <p>Feldolgozási adatok még nem érhetőek el. Töltsön fel egy képet az Upload File gombbal.</p>
        </div>
      </Show>
    </div>
  );
}
export default MatrixVisualizer
