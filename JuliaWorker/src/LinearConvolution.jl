module LinearConvolution

using ..JuliaWorker
using FFTW
using Distributed
using SharedArrays
using CUDA

export fftconvolve2d, parallel_fftconvolve2d, sa_parallel_fftconvolve2d

function fftconvolve2d(in1::Matrix{T}, in2::Matrix{T}; threshold=1e-10) where T<:Number
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

    # Extract the valid part of the result with same dimensions as input
    start_row = div(s2[1] - 1, 2)
    start_col = div(s2[2] - 1, 2)
    return result[start_row+1:start_row+s1[1], start_col+1:start_col+s1[2]]
end

function parallel_fftconvolve2d(in1::Matrix{T}, in2::Matrix{T}; threshold=1e-10) where T<:Number
    s1 = size(in1)
    s2 = size(in2)

    # Ensure template size is 3x3
    @assert s2 == (3,3) "Template size must be 3x3"
    
    # Calculate padding needed for each block
    pad_size = 1  # For 3x3 template, we need 1 pixel padding

    # Split the input matrix in1 into blocks
    num_workers = nworkers()
    block_size = div(size(in1, 1), num_workers)
    
    # Create tasks for each worker
    tasks = []
    for i in 1:num_workers
        start_row = (i - 1) * block_size + 1
        end_row = i == num_workers ? size(in1, 1) : i * block_size
        
        # Add padding to blocks (except for boundaries)
        pad_top = i > 1 ? pad_size : 0
        pad_bottom = i < num_workers ? pad_size : 0
        
        # Extract block with padding
        block_start = max(1, start_row - pad_top)
        block_end = min(s1[1], end_row + pad_bottom)
        block = in1[block_start:block_end, :]
        
        # Process block
        push!(tasks, @spawn fftconvolve2d(block, in2; threshold=threshold))
    end

    # Collect results from all workers
    results = fetch.(tasks)

    # Initialize output matrix with same dimensions as input
    output = zeros(T, s1)
    
    # Combine results into the output matrix
    for (i, res) in enumerate(results)
        start_row = (i - 1) * block_size + 1
        end_row = i == num_workers ? s1[1] : i * block_size
        
        # Handle overlapping regions
        if i > 1
            # Blend the overlapping region with previous block
            overlap_start = start_row
            overlap_end = start_row + pad_size - 1
            output[overlap_start:overlap_end, :] .= 
                (output[overlap_start:overlap_end, :] .+ 
                 res[1:pad_size, :]) ./ 2
            
            # Copy the non-overlapping part
            output[overlap_end+1:end_row, :] .= 
                res[pad_size+1:size(res,1)-pad_size+1, :]
        else
            # For first block, just copy the result
            output[start_row:end_row, :] .= res[1:end_row-start_row+1, :]
        end
    end

    return output
end
# Shared Array method
function sa_parallel_fftconvolve2d(in1::Union{Matrix{T}, SharedArray{T}}, in2::Matrix{T}; threshold=1e-10) where T<:Number
    s1 = size(in1)
    s2 = size(in2)

    # Ensure template size is 3x3
    @assert s2 == (3, 3) "Template size must be 3x3"

    # Calculate padding needed for each block
    pad_size = 1  # For 3x3 template, we need 1 pixel padding

    # Split the input matrix in1 into blocks
    num_workers = nworkers()
    block_size = div(size(in1, 1), num_workers)

    # Initialize output as a SharedArray for parallel writing
    output = SharedArray{T}(s1)

    # Create tasks for each worker
    @sync for i in 1:num_workers
        @spawn begin
            start_row = (i - 1) * block_size + 1
            end_row = i == num_workers ? s1[1] : i * block_size

            # Add padding to blocks (except for boundaries)
            pad_top = i > 1 ? pad_size : 0
            pad_bottom = i < num_workers ? pad_size : 0

            # Extract block with padding
            block_start = max(1, start_row - pad_top)
            block_end = min(s1[1], end_row + pad_bottom)
            block = in1[block_start:block_end, :]

            # Perform convolution on the block
            conv_result = fftconvolve2d(block, in2; threshold=threshold)

            # Handle overlapping regions
            if i > 1
                # Blend the overlapping region with the previous block
                overlap_start = start_row
                overlap_end = start_row + pad_size - 1
                output[overlap_start:overlap_end, :] .=
                    (output[overlap_start:overlap_end, :] .+
                     conv_result[1:pad_size, :]) ./ 2

                # Copy the non-overlapping part
                output[overlap_end+1:end_row, :] .=
                    conv_result[pad_size+1:size(conv_result, 1)-pad_size+1, :]
            else
                # For the first block, just copy the result
                output[start_row:end_row, :] .= conv_result[1:end_row-start_row+1, :]
            end
        end
    end

    return output
end

# GPU-compatible versions
function cu_fftconvolve2d(in1::CuArray{T,2}, in2::CuArray{T,2}; threshold=1e-10) where T<:Number
    s1 = size(in1)
    s2 = size(in2)

    padded_size = (s1[1] + s2[1] - 1, s1[2] + s2[2] - 1)
    next_power_of_2 = (2^ceil(Int, log2(padded_size[1])), 2^ceil(Int, log2(padded_size[2])))

    padded_in1 = CUDA.zeros(ComplexF64, next_power_of_2...)
    padded_in2 = CUDA.zeros(ComplexF64, next_power_of_2...)

    padded_in1[1:s1[1], 1:s1[2]] .= in1
    padded_in2[1:s2[1], 1:s2[2]] .= in2

    fft_in1 = CUDA.CUFFT.fft(padded_in1)
    fft_in2 = CUDA.CUFFT.fft(padded_in2)

    fft_result = fft_in1 .* fft_in2

    result = real(CUDA.CUFFT.ifft(fft_result))
    result .= (abs.(result) .>= threshold) .* result  # Avoid scalar indexing

    start_row = div(s2[1] - 1, 2)
    start_col = div(s2[2] - 1, 2)
    return result[start_row+1:start_row+s1[1], start_col+1:start_col+s1[2]]
end

function cu_parallel_fftconvolve2d(in1::CuArray{T,2}, in2::CuArray{T,2}; threshold=1e-10) where T<:Number
    s2 = size(in2)
    @assert s2 == (3,3) "Template size must be 3x3"
    fftconvolve2d(in1, in2; threshold=threshold)
end

end
