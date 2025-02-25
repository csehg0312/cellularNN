module CuLinearConvolution

using ..JuliaWorker
using FFTW
using CUDA

export fftconvolve2d

function fftconvolve2d(in1::CuArray{T,2}, in2::CuArray{T,2}; threshold=1e-10) where T<:Number
    s1 = size(in1)
    s2 = size(in2)

    # Calculate the padded size
    padded_size = (s1[1] + s2[1] - 1, s1[2] + s2[2] - 1)

    # Calculate the next power of 2 for efficient FFT
    next_power_of_2 = (2^ceil(Int, log2(padded_size[1])), 2^ceil(Int, log2(padded_size[2])))

    # Create padded arrays on GPU
    padded_in1 = CUDA.zeros(ComplexF64, next_power_of_2...)
    padded_in2 = CUDA.zeros(ComplexF64, next_power_of_2...)

    # Copy the original arrays into the padded arrays
    padded_in1[1:s1[1], 1:s1[2]] .= in1
    padded_in2[1:s2[1], 1:s2[2]] .= in2

    # Perform FFT on the padded arrays
    fft_in1 = CUDA.CUFFT.fft(padded_in1)
    fft_in2 = CUDA.CUFFT.fft(padded_in2)

    # Multiply the FFT results
    fft_result = fft_in1 .* fft_in2

    # Perform inverse FFT and apply thresholding
    result = real(CUDA.CUFFT.ifft(fft_result))
    # Apply thresholding using broadcasting
    # CUDA.@allowscalar result[abs.(result) .< threshold] .= 0  # Use allowscalar for indexing if it is accessible
    result .= (abs.(result) .>= threshold) .* result 

    # Extract the valid part of the result with same dimensions as input
    start_row = div(s2[1] - 1, 2)
    start_col = div(s2[2] - 1, 2)
    return result[start_row+1:start_row+s1[1], start_col+1:start_col+s1[2]]
end
# Fallback method for non-GPU systems or unsupported types
function fftconvolve2d(in1::Matrix{T}, in2::Matrix{T}; threshold=1e-10) where T
    s1 = size(in1)
    s2 = size(in2)

    # Calculate the padded size
    padded_size = (s1[1] + s2[1] - 1, s1[2] + s2[2] - 1)

    # Calculate the next power of 2 for efficient FFT
    next_power_of_2 = (2^ceil(Int, log2(padded_size[1])), 2^ceil(Int, log2(padded_size[2])))

    # Create padded arrays
    padded_in1 = zeros(Complex{Float64}, next_power_of_2)
    padded_in2 = zeros(Complex{Float64}, next_power_of_2)

    # Copy the original arrays into the padded arrays
    padded_in1[1:s1[1], 1:s1[2]] = in1
    padded_in2[1:s2[1], 1:s2[2]] = in2

    # Perform FFT on the padded arrays
    fft_in1 = fft(padded_in1)
    fft_in2 = fft(padded_in2)

    # Multiply the FFT results
    fft_result = fft_in1 .* fft_in2

    # Perform inverse FFT and apply thresholding
    result = real(ifft(fft_result))
    result[abs.(result) .< threshold] .= 0  # Set very small values to exact zero

    # Calculate the valid convolution area
    valid_rows = s1[1] + s2[1] - 1
    valid_cols = s1[2] + s2[2] - 1

    # Extract the valid part of the result
    valid_result = result[1:valid_rows, 1:valid_cols]

    # Calculate the start indices for centering the result
    start_row = div(s2[1], 2)
    start_col = div(s2[2], 2)

    # Return the centered result
    return valid_result[start_row+1:start_row+s1[1], start_col+1:start_col+s1[2]]
end

end
