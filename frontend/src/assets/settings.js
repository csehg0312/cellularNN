// settings.js - Data structure for select options
export const modeOptions = [
  {
    groupName: "Edge and Contour Extraction",
    options: [
      { value: "edge_detect_", label: "Edge Detection (Él detektálás)" },
      { value: "grayscale_edge_detect_", label: "Grayscale Edge Detection (Szürke él detektálás)" },
      { value: "optimal_edge_detect_", label: "Optimal Edge Detect" },
      { value: "edge_enhance_", label: "Edge enhance" },
      { value: "laplacian_edge_", label: "Laplacian Edge Detect" },
      { value: "sobel_edge_detect_", label: "Sobel Edge Detection" },
      { value: "log_edge_", label: "Laplacian of Gaussian Edge detection" }
    ]
  },
  {
    groupName: "Line Structure Detection",
    options: [
      { value: "diagonal_line_detect_", label: "Diagonal line detection" },
      { value: "horizontal_line_detect_", label: "Horizontal Line Detect" },
      { value: "vertical_line_detect_", label: "Vertical Line Detect" }
    ]
  },
  {
    groupName: "Basic Image Transformations",
    options: [
      { value: "inversion_", label: "Inversion (Inverz)" },
      { value: "noise_removal_", label: "Noise removal" },
      { value: "sharpen_", label: "Sharpen" },
      { value: "halftone_", label: "Halftone" },
      { value: "diffusion_", label: "Diffusion" },
      { value: "hexagonal_retinal_", label: "Hexagonal retinal processing 5x5 (mimic human vision)" },
      { value: "binary_erosion_", label: "Binary erosion (Erózió)" },
      { value: "binary_dilation_", label: "Binary dilation" },
    ]
  },
  {
    groupName: "Shape and Region Detection",
    options: [
      { value: "circle_detect_", label: "Circle detection (Kör detektálás)" },
      { value: "rectangle_detect_", label: "Rectangle detection (Négyzet detektálás)" },
      { value: "corner_detect_", label: "Corner detection (Sarok detektálás)" },
      { value: "blob_detect_", label: "Blob detect" },
      { value: "texture_segment_", label: "Texture segmentation" }
    ]
  },
  {
    groupName: "Dynamic Scene Analysis",
    options: [
      { value: "motion_detect_", label: "Motion detection" },
      { value: "shadow_detect_", label: "Shadow Detection" }
    ]
  },
  {
    groupName: "Specialized and Miscellaneous Modes",
    options: [
      { value: "wave_template_", label: "Traveling Wave template (Hullámok modellezése)" },
      { value: "connected_comp_", label: "Connected Components" },
      { value: "saved_", label: "Saved" }
    ]
  }
];
