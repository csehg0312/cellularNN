import subprocess
import os
import signal
import sys

def run_worker():
    # Path to the Julia executable
    julia_executable = "julia"
    julia_env_path = os.path.expanduser("/app/JuliaWorker") # Use expanduser to handle "~"

    # Julia script to run your function
    julia_script = f"""
        using Pkg
        Pkg.activate("{julia_env_path}")  # Activate your Julia environment
        using JuliaWorker
        JuliaWorker.main()
    """
    # Pkg.instantiate()

    # Create a temporary file to hold the Julia script
    with open("temp_script.jl", "w") as f:
        f.write(julia_script)

    # Call the Julia script using subprocess
    try:
        # Use Popen for more control
        process = subprocess.Popen(
            [julia_executable, "temp_script.jl"], 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True
        )

        # Setup signal handling
        def signal_handler(signum, frame):
            print("\nInterrupt received, terminating Julia process...")
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)

        # Read output in real-time
        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                print(output.strip())

        # Check return code
        return_code = process.poll()
        if return_code != 0:
            print("Error calling Julia:")
            print(process.stderr.read())
            
    except Exception as e:
        print(f"An error occurred: {e}")
    finally: 
        # Clean up temporary script
        try:
            os.remove("temp_script.jl")
        except OSError:
            pass

if __name__ == "__main__":
    run_worker()
