module CuLinearConvolution

using ..JuliaWorker
using FFTW
using CUDA

export parallel_fftconvolve2d

function cu_fftconvolve2d(in1::CuArray{T,2}, in2::CuArray{T,2}; threshold=1e-10) where T<:Number
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

function parallel_fftconvolve2d(in1::CuArray{T,2}, in2::CuArray{T,2}; threshold=1e-10) where T<:Number
    s2 = size(in2)
    @assert s2 == (3,3) "Template size must be 3x3"
    cu_fftconvolve2d(in1, in2; threshold=threshold)
end

end
