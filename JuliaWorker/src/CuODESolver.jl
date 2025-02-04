module ODESolver

using ..JuliaWorker
using ..LinearConvolution
using ..Activation
include("SocketLogger.jl")

using CUDA
using Sundials
using Images
using FileIO
using Base64
using WebSockets

export solve_ode

function f!(du, u, p, t)
    Ib, Bu, tempA, n, m = p
    x_mat = reshape(u, n, m)
    
    # Use CUDA kernel for activation
    function activation_kernel!(x)
        i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
        if i <= length(x)
            @inbounds x[i] = Activation.safe_activation(x[i])
        end
        return nothing
    end
    
    # Activate on GPU
    x_mat_d = CuArray(x_mat)
    threads = 256
    blocks = ceil(Int, length(x_mat_d) / threads)
    @cuda threads=threads blocks=blocks activation_kernel!(x_mat_d)
    x_mat = Array(x_mat_d)
    
    conv_result = LinearConvolution.fftconvolve2d(x_mat, tempA)
    
    # Use CUDA kernel for ODE update
    function update_kernel!(du, u, Ib, Bu, conv_result)
        i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
        if i <= length(du)
            @inbounds du[i] = clamp(-u[i] + Ib + Bu[i] + conv_result[i], -1e6, 1e6)
        end
        return nothing
    end
    
    du_d = CuArray(du)
    u_d = CuArray(u)
    Bu_d = CuArray(Bu)
    conv_result_d = CuArray(conv_result)
    
    @cuda threads=threads blocks=blocks update_kernel!(du_d, u_d, Ib, Bu_d, conv_result_d)
    
    copyto!(du, Array(du_d))
    
    return nothing
end

function ode_result_process(z, n, m)
    # Use CUDA kernel for processing
    function process_kernel!(z)
        i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
        if i <= length(z)
            @inbounds z[i] = Activation.safe_activation(z[i])
        end
        return nothing
    end
    
    z_d = CuArray(z)
    threads = 256
    blocks = ceil(Int, length(z_d) / threads)
    
    @cuda threads=threads blocks=blocks process_kernel!(z_d)
    z = Array(z_d)
    
    out_l = reshape(z, n, m)
    
    # Normalize
    min_val, max_val = extrema(out_l)
    
    function normalize_kernel!(out_l, min_val, max_val)
        i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
        if i <= length(out_l)
            @inbounds out_l[i] = (out_l[i] - min_val) / (max_val - min_val)
        end
        return nothing
    end
    
    out_l_d = CuArray(out_l)
    @cuda threads=threads blocks=blocks normalize_kernel!(out_l_d, min_val, max_val)
    out_l = Array(out_l_d)
    
    # Clamp and scale
    function clamp_scale_kernel!(out_l)
        i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
        if i <= length(out_l)
            @inbounds out_l[i] = round(UInt8, clamp(out_l[i], 0.0, 1.0) * 255)
        end
        return nothing
    end
    
    out_l_d = CuArray(out_l)
    @cuda threads=threads blocks=blocks clamp_scale_kernel!(out_l_d)
    out_l = Array(out_l_d)
    
    return out_l
end

function solve_ode(socket_conn, image::Matrix{Float64}, Ib::Float64, tempA::Matrix{Float64}, tempB::Matrix{Float64}, t_span::Vector{Float64}, initial_condition::Float64, wsocket)
    SocketLogger.write_log_to_socket(socket_conn, "Starting ODE solver...\n")
    WebSockets.write(wsocket, "Started ODE solver...")
    n, m = size(image)

    # Normalize incoming image from [0, 255] to [-1, 1]
    image_normalized = similar(image)
    @cuda threads=256 for i in eachindex(image)
        image_normalized[i] = (image[i] / 127.5) - 1  # Normalize to [-1, 1]
    end

    # Prepare initial conditions
    z0 = similar(image_normalized)
    @cuda threads=256 for i in eachindex(image_normalized)
        z0[i] = initial_condition * image_normalized[i]
    end

    SocketLogger.write_log_to_socket(socket_conn, "Before Bu init")
    WebSockets.write(wsocket, "First convolution started")
    Bu = fftconvolve2d(image_normalized, tempB)  # Assuming this function is optimized for CUDA
    SocketLogger.write_log_to_socket(socket_conn, "After Bu init")
    WebSockets.write(wsocket, "First convolution ended")
    params = (Ib, Bu, tempA, n, m)

    # Set up and solve ODE problem
    SocketLogger.write_log_to_socket(socket_conn, "Before ODE problem")
    prob = ODEProblem(f!, z0, (t_span[1], t_span[end]), params)
    sol = solve(prob, CVODE_BDF(linear_solver=:GMRES), reltol=1e-5, abstol=1e-8, maxiters=1000000)
    SocketLogger.write_log_to_socket(socket_conn, "After ODE problem")
    WebSockets.write(wsocket, "ODE solved")

    # Process results
    z = sol[end]
    out_l = ode_result_process(z, n, m)

    # Normalize out_l back to [0, 255]
    @cuda threads=256 for i in eachindex(out_l)
        out_l[i] = clamp(round(UInt8, (out_l[i] + 1) * 127.5), 0, 255)  # Normalize back to [0, 255]
    end

    # Convert to binary image format
    binary_image = Gray.(out_l ./ 255)  # Normalize to 0 or 1
    
    # Encode the binary image as PNG into an IOBuffer
    io = IOBuffer()
    FileIO.save(Stream(format"PNG", io), binary_image)
    binary_data = take!(io)
    
    img_base64 = base64encode(binary_data)
    image_packet = "data:image/png;base64,$img_base64"

    return image_packet
end

end