module CuODESolver

using ..JuliaWorker
using ..LinearConvolution
using ..Activation
include("SocketLogger.jl")

using CUDA           # Add CUDA.jl for GPU support
using LoopVectorization
using Sundials
using Images
using FileIO
using Base64
using WebSockets
#using OrdinaryDiffEq  # Switch to DifferentialEquations.jl's ODE solvers

export solve_ode

function f!(du, u, p, t)
    Ib, Bu, tempA, n, m, wsocket = p
    WebSockets.write(wsocket, "Solving at $t time")
    
    # Reshape and operate on GPU arrays
    x_mat = reshape(u, n, m)
    
    # Apply activation function using broadcast (works on GPU)
    x_mat .= Activation.safe_activation.(x_mat)
    
    # GPU-compatible convolution
    conv_result = LinearConvolution.cu_parallel_fftconvolve2d(x_mat, tempA)
    
    # Compute derivative with GPU-accelerated operations
    @. du = clamp(-u + Ib + Bu + conv_result, -1e6, 1e6)
    
    return nothing
end

function process_and_generate_image(z, n, m, wsocket)
    # Ensure input is on CPU (z should already be Array after Array(sol[end]))
    out_l = reshape(z, n, m)

    # Use broadcast for GPU/CPU compatibility
    out_l .= Activation.safe_activation.(out_l)
    
    # Calculate extrema on GPU if input was CuArray
    min_val, max_val = extrema(out_l)
    out_l .= (out_l .- min_val) ./ (max_val - min_val)
    out_l .= clamp.(out_l, 0.0, 1.0) .* 255
    
    try
        binary_image = Gray.(out_l ./ 255)
        io = IOBuffer()
        FileIO.save(Stream(format"PNG", io), binary_image)
        binary_data = take!(io)
        img_base64 = base64encode(binary_data)
        WebSockets.write(wsocket, "data:image/png;base64,$img_base64")
        cleanup_memory!(binary_image, binary_data, img_base64, io)
    catch e
        WebSockets.write(wsocket, "Image processing error: $e")
    end
end

function cleanup_memory!(vars...)
    for var in vars
        try
            if var isa Array || var isa IOBuffer
                Base.finalize(var)
            end
        catch e
            @warn "Cleanup error: $e"
        end
        var = nothing
    end
    GC.gc(true)
end

function solve_ode(socket_conn, image::Matrix{Float64}, Ib::Float64, tempA::Matrix{Float64}, tempB::Matrix{Float64}, t_span::Vector{Float64}, initial_condition::Float64, wsocket)
    SocketLogger.write_log_to_socket(socket_conn, "Starting ODE solver...\n")
    WebSockets.write(wsocket, "Started ODE solver...")
    
    n, m = size(image) 
    image_normalized = similar(image) 
    @turbo for i in eachindex(image) 
        image_normalized[i] = (image[i] / 127.5) - 1 
    end
    
    # Move data to GPU
    tempA_gpu = CuArray(tempA)
    tempB_gpu = CuArray(tempB)
    image_normalized_gpu = CuArray(image_normalized)
    
    WebSockets.write(wsocket, "First convolution started")
    Bu = LinearConvolution.parallel_fftconvolve2d(image_normalized_gpu, tempB_gpu)
    WebSockets.write(wsocket, "First convolution ended")
    
    @turbo for i in eachindex(image_normalized) 
        image_normalized[i] *= initial_condition 
    end 
    z0 = CuArray(image_normalized)
    
    params = (Ib, Bu, tempA_gpu, n, m, wsocket)

    # Use GPU-compatible solver
    prob = ODEProblem(f!, z0, (t_span[1], t_span[end]), params)
    sol = solve(prob, Tsit5(), save_everystep=false, reltol=1e-5, abstol=1e-8)
    WebSockets.write(wsocket, "ODE solved")

    # Transfer result back to CPU for image processing
    process_and_generate_image(Array(sol[end]), n, m, wsocket)
    
    # Explicit memory cleanup
    CUDA.reclaim()
    cleanup_memory!(prob, sol, Bu, z0, image_normalized, params)
end
end
