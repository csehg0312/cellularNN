module ODESolver

using ..JuliaWorker
using ..LinearConvolution
using ..Activation
include("SocketLogger.jl")

using LoopVectorization
using Sundials

export solve_ode

function f!(du, u, p, t)
    Ib, Bu, tempA, n, m = p
    x_mat = reshape(u, n, m)
    # Apply activation function to each element of x_mat
    @turbo for i in eachindex(x_mat)
        x_mat[i] = Activation.safe_activation(x_mat[i])
    end
    # Perform 2D convolution using FFT
    conv_result = LinearConvolution.fftconvolve2d(x_mat, tempA)
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

# function Normalization(input)
#     output = @. (input / 127.5) -1
#     return output
# end

# function normalize_image!(input, output)
#     @avx for i in eachindex(input)
#         output[i] = (input[i] / 127.5) - 1
#     end
# end

# function Denormalization(input)
#     output = @. (input * 127.5) +1
#     return output
# end

function solve_ode(socket_conn, image::Matrix{Float64}, Ib::Float64, tempA::Matrix{Float64}, tempB::Matrix{Float64}, t_span::Vector{Float64}, initial_condition::Float64)
    SocketLogger.write_log_to_socket(socket_conn, "Starting ODE solver...\n")
    n, m = size(image)
    # Prepare initial conditions
    @turbo for i in eachindex(out_l)
        image_normalized = (image[i] / 127.5) - 1
    end
    @turbo for i in eachindex(initial_condition)
        z0 = (initial_condition[i] / 127.5) - 1
    end
    # z0 = fill(initial_condition, n * m)
    SocketLogger.write_log_to_socket(socket_conn, "Before Bu init")

    Bu = fftconvolve2d(image_normalized, tempB)
    SocketLogger.write_log_to_socket(socket_conn, "After Bu init")
    params = (Ib, Bu, tempA, n, m)

    # Set up and solve ODE problem
    SocketLogger.write_log_to_socket(socket_conn, "Before ODE problem")
    prob = ODEProblem(f!, z0, (t_span[1], t_span[end]), params)
    sol = solve(prob, CVODE_BDF(linear_solver=:GMRES), reltol=1e-5, abstol=1e-8, maxiters=1000000)
    SocketLogger.write_log_to_socket(socket_conn, "After ODE problem")
    # open("solution_output.txt", "w") do file
    #     for j in 1:length(sol)
    #         # Print the timestep header
    #         println(file, "Solution at timestep $j:")
            
    #         # Get the processed result
    #         processed_result = ode_result_process(sol[j], n, m)
            
    #         # Print the solution for the current timestep
    #         for row in eachrow(processed_result)
    #             println(file, join(row, ", "))  # Join elements of the row with a comma
    #         end
    #     end
    # end

    # Process results
    z = sol[end]
    @turbo for i in eachindex(z)
        z[i] = Activation.safe_activation(z[i])
    end
    out_l = reshape(z, n, m)

    SocketLogger.write_log_to_socket(socket_conn, "Normalizing data\n")
    # Normalize to [0, 255] range
    # min_val, max_val = extrema(out_l)
    @turbo for i in eachindex(out_l)
        out_l[i] = (out_l[i] * 127.5) + 1
    end

    # SocketLogger.write_log_to_socket(socket_conn, "Clamping and scaling data\n")
    # # Clamp and scale to 0-255
    # @turbo for i in eachindex(out_l)
    #     out_l[i] = round(UInt8, clamp(out_l[i], 0.0, 1.0) * 255)
    # end

    return out_l
end

end