module ODESolver
    using Distributed
    using SharedArrays
    using WebSockets
    using FileIO
    using Sundials
    using ..SocketLogger
    using ..LinearConvolution
    using ..Activation

    export f!, solve_ode

    function f!(du, u, p, t)
        Ib, Bu, tempA, n, m, wsocket = p
        WebSockets.write(wsocket, "Solving at $t time")
        
        # Create shared arrays for parallel processing
        x_mat = SharedArray(reshape(u, n, m))
        result = SharedArray(similar(x_mat))
        
        # Parallel activation function application
        @sync @distributed for i in eachindex(x_mat)
            @inbounds x_mat[i] = Activation.safe_activation(x_mat[i])
        end
        
        # Perform parallel 2D convolution
        conv_result = LinearConvolution.parallel_fftconvolve2d(x_mat, tempA)
        
        # Parallel derivative computation
        @sync @distributed for i in eachindex(du)
            @inbounds du[i] = clamp(-u[i] + Ib + Bu[i] + conv_result[i], -1e6, 1e6)
        end
    end

    function solve_ode(socket_conn, image::Matrix{Float64}, Ib::Float64, tempA::Matrix{Float64}, 
        tempB::Matrix{Float64}, t_span::Vector{Float64}, initial_condition::Float64, wsocket)
        SocketLogger.write_log_to_socket(socket_conn, "Task arrived to worker to solve ODE\n")
        WebSockets.write(wsocket, "Task arrived to worker to solve ODE")
        
        n, m = size(image)
        
        # Create shared arrays for parallel processing
        image_normalized = SharedArray{Float64}(size(image))
        z0 = SharedArray{Float64}(size(image))
        
        # Parallel image normalization
        @sync @distributed for i in eachindex(image)
            @inbounds image_normalized[i] = (image[i] / 127.5) - 1
        end
        
        # Parallel initial condition setup
        @sync @distributed for i in eachindex(image_normalized)
            @inbounds z0[i] = initial_condition * image_normalized[i]
        end
        
        SocketLogger.write_log_to_socket(socket_conn, "First convolution starting to get Bu")
        WebSockets.write(wsocket, "First convolution starting")
        
        # Parallel convolution
        Bu = LinearConvolution.parallel_fftconvolve2d(image_normalized, tempB)
        
        SocketLogger.write_log_to_socket(socket_conn, "First convolution ended successfully")
        WebSockets.write(wsocket, "First convolution ended successfully")
        
        params = (Ib, Bu, tempA, n, m, wsocket)
        
        # Set up and solve ODE problem with parallel solver
        SocketLogger.write_log_to_socket(socket_conn, "Starting ODE problem solving with Sundials")
        WebSockets.write(wsocket, "Starting ODE problem solving with Sundials")
        
        prob = ODEProblem(f!, Array(z0), (t_span[1], t_span[end]), params)
        sol = solve(prob, CVODE_BDF(linear_solver=:GMRES), reltol=1e-5, abstol=1e-8, maxiters=1000000)
        
        SocketLogger.write_log_to_socket(socket_conn, "Ended ODE problem solving with Sundials with success")
        WebSockets.write(wsocket, "Ended ODE problem solving with Sundials with success")
        
        # Process results in parallel
        z = SharedArray(sol[end])
        out_l = SharedArray{Float64}(n, m)
        
        @sync @distributed for i in eachindex(z)
            @inbounds z[i] = Activation.safe_activation(z[i])
        end
        
        out_l = reshape(Array(z), n, m)
        
        SocketLogger.write_log_to_socket(socket_conn, "Data being normalized to [0, 1]")
        WebSockets.write(wsocket, "Data being normalized to [0, 1]")
        
        # Parallel final normalization
        @sync @distributed for i in eachindex(out_l)
            @inbounds out_l[i] = (out_l[i] + 1) / 2
        end
        
        # Image encoding
        io = IOBuffer()
        FileIO.save(Stream(format"PNG", io), Gray.(Array(out_l)))
        binary_data = take!(io)
        img_base64 = base64encode(binary_data)
        image_packet = "data:image/png;base64,$img_base64"
        
        return image_packet
    end
end