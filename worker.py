import subprocess
import os

def run_worker():
    # Path to the Julia executable
    julia_executable = "julia"  # or full path to the julia executable if not in PATH

    # Path to your Julia environment (make sure this is correct)
    julia_env_path = os.path.expanduser("~/cellularnn/JuliaWorker")  # Use expanduser to handle "~"

    # Julia script to run your function
    julia_script = f"""
        using Pkg
        Pkg.activate("{julia_env_path}")  # Activate your Julia environment
        Pkg.instantiate()  # Ensure all dependencies are installed
        using JuliaWorker
        JuliaWorker.main()
    """

    # Create a temporary file to hold the Julia script
    with open("temp_script.jl", "w") as f:
        f.write(julia_script)

    # Call the Julia script using subprocess
    try:
        result = subprocess.run([julia_executable, "temp_script.jl"], capture_output=True, text=True, check=True)
        print("Output from Julia:")
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print("Error calling Julia:")
        print(e.stderr)
    finally: 
        os.remove("temp_script.jl")

if __name__ == "__main__":
    run_worker()