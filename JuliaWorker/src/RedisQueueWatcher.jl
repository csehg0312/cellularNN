module RedisQueueWatcher

using ..JuliaWorker
using ..LinearConvolution
using ..ODESolver

using Redis, JSON, WebSockets
include("SocketLogger.jl")
export watch_redis_queue

function create_redis_connection(conn,host="localhost", port=6379, retiries=5, delay=1)
    for attempt in 1:retiries
        try
            answer = Redis.ping(Redis.RedisConnection(host=host, port=port))
            if answer == "PONG"
                SocketLogger.write_log_to_socket(conn,"Connected to Redis at $host:$port\n") 
                return Redis.RedisConnection(host=host, port=port)
            end
        catch e
            error("Failed to connect to Redis: $e\n")
        end
    end
    SocketLogger.write_log_to_socket(conn,"Failed to connect to Redis after $retries attempts\n")
end

function is_redis_connected(redis_client)
    try
        Redis.ping(redis_client)
        return true
    catch
        return false
    end
end

function safe_close_redis(redis_client)
    try
        if redis_client !== nothing
            # Access the underlying TCP socket and close it
            if hasfield(typeof(redis_client), :socket)
                isopen(redis_client.socket) && close(redis_client.socket)
            elseif hasfield(typeof(redis_client), :transport) && 
                   hasfield(typeof(redis_client.transport), :socket)
                isopen(redis_client.transport.socket) && close(redis_client.transport.socket)
            end
            # Attempt to disconnect Redis client
            try
                Redis.disconnect(redis_client)
            catch
                # Ignore disconnect errors
            end
        end
    catch e
        return false
    end
    return true
end

function cleanup(redis_client, socket_conn)
    SocketLogger.write_log_to_socket(socket_conn, "Cleaning up resources...\n")
    try
        if redis_client !== nothing
            safe_close_redis(redis_client)
        end
    catch e
        SocketLogger.write_log_to_socket(socket_conn, "Error during Redis cleanup: $e\n")
    end
end

function watch_redis_queue(redis_client, queue_name, socket_conn)
    SocketLogger.write_log_to_socket(socket_conn, "Started Redis Queue Watcher!\n")
    
    # Ensure redis_client is valid or create a new connection
    if redis_client === nothing || !is_redis_connected(redis_client)
        SocketLogger.write_log_to_socket(socket_conn, "Creating new Redis connection...\n")
        redis_client = create_redis_connection(socket_conn)
        if redis_client !== nothing
            SocketLogger.write_log_to_socket(socket_conn, "Watching queue: $queue_name\n")
        end
    end
    
    try
        while !JuliaWorker.global_interrupt_flag[]
            try
                # Check if Redis is still connected
                if !is_redis_connected(redis_client)
                    SocketLogger.write_log_to_socket(socket_conn, "Redis connection lost. Attempting to reconnect...\n")
                    redis_client = create_redis_connection(socket_conn)
                end
                # Wait for a task from the queue (with a short timeout)
                result = Redis.blpop(redis_client, queue_name, 1)  # 1 second timeout
                
                if result !== nothing
                    _, task_id = result  # Assuming result contains a tuple where the second element is a UUID
                    
                    SocketLogger.write_log_to_socket(socket_conn, "Received task ID for Redis: $task_id\n")
                    
                    # Retrieve the stored data using the key format "task:data:$task_id"
                    stored_data = Redis.get(redis_client, "task:data:$task_id")
                    
                    if stored_data !== nothing
                        SocketLogger.write_log_to_socket(socket_conn, "Retrieved stored data! \n")
                        # Process the task data (assuming it's in JSON format)
                        try
                            processed_data = JSON.parse(stored_data)

                            # Convert the image and controlB arrays to Float64
                            image = [Float64.(row) for row in processed_data["image"]]
                            # SocketLogger.write_log_to_socket(socket_conn, "Image: ", typeof(image), "\n")
                            controlB = [Float64.(row) for row in processed_data["controlB"]]
                            # SocketLogger.write_log_to_socket(socket_conn, "ControlB: ", typeof(controlB), "\n")
                            feedbackA = [Float64.(row) for row in processed_data["feedbackA"]]
                            # SocketLogger.write_log_to_socket(socket_conn, "FeedbackA: ", typeof(feedbackA), "\n")
                            t_span = convert(Vector{Float64}, processed_data["t_span"])
                            # SocketLogger.write_log_to_socket(socket_conn, "t_span:", typeof(t_span),"\n")
                            Ib = Float64(processed_data["Ib"])
                            # SocketLogger.write_log_to_socket(socket_conn, "Ib: ", typeof(Ib), "\n")
                            initialCondition = Float64(processed_data["initialCondition"])
                            # SocketLogger.write_log_to_socket(socket_conn, "initialCondition: ", typeof(initialCondition), "\n")

                             # Ensure the arrays are matrices
                            image_matrix = hcat(image...)  # Convert to a matrix
                            controlB_matrix = hcat(controlB...)  # Convert to a matrix
                            feedbackA_matrix = hcat(feedbackA...)

                            # Open WebSocket connection using the port from processed_data
                            websocket_port = processed_data["available_port"]
                            websocket_url = "ws://127.0.0.1:$websocket_port"  # Construct the WebSocket URL
                            try
                                WebSockets.open(websocket_url) do ws
                                    # Log connection
                                    SocketLogger.write_log_to_socket(socket_conn, "Connected to client socket! \n")
                                    WebSockets.write(ws, "Connection happened!")
                            
                                    try
                                        # Log processing task
                                        SocketLogger.write_log_to_socket(socket_conn, "Processing task...\n")
                                        ode_result = ODESolver.solve_ode(socket_conn, image_matrix, Ib, feedbackA_matrix, controlB_matrix, t_span, initialCondition)
                            
                                        # Log processed task
                                        processed = JSON.json(ode_result)
                                        WebSockets.write(ws, processed)
                                        # Log processed task
                                        SocketLogger.write_log_to_socket(socket_conn, "Processed task: $processed\n")
                                    catch e
                                        # Log error if processing fails
                                        SocketLogger.write_log_to_socket(socket_conn, "Error processing task: $e\n")
                                        processed = nothing
                                    end
                                end
                                cleanup(ws)
                                WebSockets.close(ws)
                            catch e
                                # Log error if connection fails
                                SocketLogger.write_log_to_socket(socket_conn, "Error connecting to client socket: $e\n")
                                processed = nothing
                            end
                            
                            
                            # Delete the processed task data from Redis
                            Redis.del(redis_client, "task:data:$task_id")
                            SocketLogger.write_log_to_socket(socket_conn, "Deleted processed task data for ID: $task_id\n")

                        
                        catch e
                            SocketLogger.write_log_to_socket(socket_conn, "Failed to parse task data! \nError: $e\n")
                            processed = nothing
                        end
                    else
                        SocketLogger.write_log_to_socket(socket_conn, "No stored data found for task ID: $task_id\n")
                        processed = nothing
                    end
                end
                
            catch e
                if e isa InterruptException
                    SocketLogger.write_log_to_socket(socket_conn, 
                        "Received interrupt signal in queue watcher. Shutting down gracefully...\n")
                    break
                else
                    SocketLogger.write_log_to_socket(socket_conn, "An error occurred in queue watcher: $e\n")
                    # SocketLogger.write_log_to_socket(socket_conn, "Backtrace: $(catch_backtrace())\n")
                    
                    # If it's a connection error, wait before retrying
                    if e isa Redis.ConnectionException || e isa Base.IOError
                        sleep(1)
                    end
                end
            end
        end
    catch e
        if !(e isa InterruptException)
            SocketLogger.write_log_to_socket(socket_conn, "Unhandled error in queue watcher: $e\n")
            SocketLogger.write_log_to_socket(socket_conn, "Backtrace: $(catch_backtrace())\n")
        end
    finally
        cleanup(redis_client, socket_conn)
        SocketLogger.write_log_to_socket(socket_conn, "Redis queue watcher shutting down...\n")
    end
end

end