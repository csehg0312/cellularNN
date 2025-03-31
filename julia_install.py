import subprocess
import os

def run_install():
    # Use the full path to the Julia executable
    julia_executable = "julia"
    julia_env_path = os.path.expanduser("~/app/JuliaWorker")
    print(f"Starting script to install julia dependecies! \n Please be patient! It can take 10+ minutes. \n")
    # Define the Julia script
    julia_script = f"""
        using Pkg
        Pkg.activate("{julia_env_path}")
        Pkg.instantiate()
    """

    # Write the Julia script to a temporary file
    with open("temp_install_script.jl", "w") as f:
        f.write(julia_script)

    try:
        # Run the Julia script
        subprocess.run([julia_executable, "temp_install_script.jl"], check=True)
        print("Installation successful.")
    except subprocess.CalledProcessError as e:
        print(f"Installation failed with error: {e}")
    finally:
        # Remove the temporary file
        os.remove("temp_install_script.jl")

# Call the function to run the installation
run_install()
