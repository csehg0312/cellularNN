module ODESolver

using ..JuliaWorker
using ..LinearConvolution
using ..Activation
include("SocketLogger.jl")

using LoopVectorization
using Sundials
using Images
using FileIO
using Base64
using WebSockets
# using GC

export solve_ode

function f!(du, u, p, t)
    Ib, Bu, tempA, n, m, wsocket = p
    WebSockets.write(wsocket, "Solving at $t time")
    x_mat = reshape(u, n, m)
    # Apply activation function to each element of x_mat
    @turbo for i in eachindex(x_mat)
        x_mat[i] = Activation.safe_activation(x_mat[i])
    end
    # Perform 2D convolution using FFT
    conv_result = LinearConvolution.parallel_fftconvolve2d(x_mat, tempA)
    # Compute the derivative du for each element, ensuring it's clamped
    @turbo for i in eachindex(du)
        du[i] = clamp(-u[i] + Ib + Bu[i] + conv_result[i], -1e6, 1e6)
    # end of the function
    end
end

function ode_result_process(z, n, m)
    @turbo for i in eachindex(z)
        z[i] = Activation.safe_activation(z[i])
    end
    out_l = reshape(z, n, m)

    # Normalize to [0, 1] range
    min_val, max_val = extrema(out_l)
    @turbo for i in eachindex(out_l)
        out_l[i] = (out_l[i] - min_val) / (max_val - min_val)
    end

    # Clamp and scale to 0-255
    @turbo for i in eachindex(out_l)
        out_l[i] = round(UInt8, clamp(out_l[i], 0.0, 1.0) * 255)
    end

    return out_l
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

function process_and_generate_image(z, n, m, wsocket)
    out_l = reshape(z, n, m)

    # Threshold values and check for NaN/Inf
    out_l .= ifelse.(isnan.(out_l) .| isinf.(out_l), 0.0, ifelse.(out_l .> 0, 255.0, 0.0))

    try
        # Ensure all values are valid
        clamped_out = clamp.(out_l, 0.0, 255.0)

        # Convert to image
        binary_image = Gray.(clamped_out ./ 255)

        # First step: Fix horizontal mirroring by flipping the original image
        # This reverses the order of columns (horizontal flip)
        unmirrored_image = reverse(binary_image, dims=2)

        # Now rotate the unmirrored image
        # We'll use rotl90 instead of imrotate to avoid interpolation issues
        rotated_image = rotl90(unmirrored_image)

        # Verify rotated image validity
        if any(isnan, rotated_image) || any(isinf, rotated_image)
            WebSockets.write(wsocket, "Invalid pixel values after rotation")
            return
        end

        # Continue with encoding
        io_rotated = IOBuffer()
        FileIO.save(Stream(format"PNG", io_rotated), rotated_image)
        binary_data = take!(io_rotated)
        img_base64 = base64encode(binary_data)
        image_packet = "data:image/png;base64,$img_base64"

        # Send the image
        WebSockets.write(wsocket, image_packet)
        cleanup_memory!(binary_image, rotated_image, binary_data, img_base64, image_packet, io_rotated)
    catch e
        WebSockets.write(wsocket, "Image processing error: $e")
        cleanup_memory!(z, out_l)
    end
end

function solve_ode(socket_conn, image::Matrix{Float64}, Ib::Float64, tempA::Matrix{Float64}, tempB::Matrix{Float64}, t_span::Vector{Float64}, initial_condition::Float64, wsocket)
    SocketLogger.write_log_to_socket(socket_conn, "Starting ODE solver...\n")
    WebSockets.write(wsocket, "Started ODE solver...")
    # Kezdeti allapotok elokeszitese
    n, m = size(image) 
    image_normalized = similar(image) 
    @turbo for i in eachindex(image) 
        image_normalized[i] = (image[i] / 127.5) - 1 
    end
    # z0 = similar(image_normalized)
    SocketLogger.write_log_to_socket(socket_conn, "Before Bu init")
    WebSockets.write(wsocket, "First convolution started")
    Bu = LinearConvolution.parallel_fftconvolve2d(image_normalized, tempB)
    WebSockets.write(wsocket, "First convolution ended")
    SocketLogger.write_log_to_socket(socket_conn, "After Bu init")
    # @turbo for i in eachindex(image_normalized)
    #     z0[i] = initial_condition * image_normalized[i]
    # end
    @turbo for i in eachindex(image_normalized) 
        image_normalized[i] *= initial_condition 
    end 
    z0 = image_normalized # Now image_normalized is z0
    # z0 = fill(initial_condition, n * m)
    
    params = (Ib, Bu, tempA, n, m, wsocket)

    # Set up and solve ODE problem
    SocketLogger.write_log_to_socket(socket_conn, "Before ODE problem")
    WebSockets.write(wsocket, "ODE Solver started!")
    prob = ODEProblem(f!, z0, (t_span[1], t_span[end]), params)
    sol = solve(prob, CVODE_BDF(linear_solver=:GMRES), reltol=1e-5, abstol=1e-8, maxiters=1000000)
    SocketLogger.write_log_to_socket(socket_conn, "After ODE problem")
    WebSockets.write(wsocket, "ODE solved")

    # Process results
    process_and_generate_image(sol[end], n, m, wsocket)

    # Cleanup memory
    cleanup_memory!(prob, sol, Bu, z0, image_normalized, params)
    # return image_packet
end

end
