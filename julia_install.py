import subprocess
import os

def run_install():
    julia_executable = "julia"

    julia_env_path = os.path.expanduser("~/cellularnn/JuliaWorker")

    julia_script = f"""
        using Pkg
        Pkg.activate("{julia_env_path}")
        Pkg.instantiate()
    """

with open("temp_install_script.jl", "w") as f:
    f.write(julia_script)

try:
    subprocess.run([julia_executable, "temp_install_script.jl"], check=True)
    print("Installation successful.")
except subprocess.CalledProcessError as e:
    print(f"Installation failed with error: {e}")
finally:
    os.remove("temp_install_script.jl")

# os.remove("temp_install_script.jl")