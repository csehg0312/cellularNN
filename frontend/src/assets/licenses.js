/**
 * List of licenses with their details.
 *
 * @type {Object<string, License>}
 */
const licenses = {
    1 : {
      name: "PyCNN",
      link: "https://github.com/ankitaggarwal011/PyCNN",
      createdBy: "ankitaggarwal011",
      license: "MIT",
      description: "Image Processing with Cellular Neural Networks in Python",
    },
    2 : {
        name: "aiortc/aiortc",
        link: "https://github.com/aiortc/aiortc",
        createdBy: "aiortc",
        license: "BSD-3-Clause",
        description: "WebRTC and ORTC implementation for Python using asyncio",
    },
    3 : {
        name: "Sundial.jl",
        link: "https://github.com/SciML/Sundials.jl",
        createdBy: "SciML",
        license: "BSD-2-Clause",
        description: "Julia interface to Sundials, including a nonlinear solver (KINSOL), ODE's (CVODE and ARKODE), and DAE's (IDA) in a SciML scientific machine learning enabled manner"
    },
    4 : {
        name: "FFTW.jl",
        link: "https://github.com/JuliaMath/FFTW.jl",
        createdBy: "JuliaMath",
        license: "MIT",
        description: "Julia bindings to the FFTW library for fast Fourier transforms"
    }
  };
  
  /**
   * License interface.
   *
   * @typedef {Object} License
   * @property {string} name - License name.
   * @property {string} link - License link.
   * @property {string} createdBy - License creator.
   * @property {string} license - License type.
   * @property {string} description - License description.
   */
  
  export default licenses;