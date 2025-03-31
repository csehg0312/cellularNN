import subprocess
import os
import sys
import tempfile
import time
import shutil
from pathlib import Path

def find_julia_executable():
    """Find the Julia executable in the system."""
    # Check if julia is in PATH
    julia_path = shutil.which("julia")
    if julia_path:
        return julia_path
    
    # Common locations to check for Julia
    possible_locations = [
        "/usr/bin/julia",
        "/usr/local/bin/julia",
        "/opt/julia/bin/julia",
        "/app/julia/bin/julia"
    ]
    
    for location in possible_locations:
        if os.path.isfile(location) and os.access(location, os.X_OK):
            return location
            
    return None

def setup_network_environment():
    """Setup network environment variables that might be needed in Podman."""
    # Common proxy variables that might be needed
    proxy_vars = ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "no_proxy", "NO_PROXY"]
    
    # Check if any proxy variables are set in the host and log them
    proxies_found = False
    for var in proxy_vars:
        if var in os.environ:
            print(f"Found proxy setting: {var}={os.environ[var]}")
            proxies_found = True
    
    if not proxies_found:
        print("No proxy settings found in environment.")
    
    # DNS check
    try:
        subprocess.run(["dig", "+short", "pkg.julialang.org"], 
                      stdout=subprocess.PIPE, 
                      stderr=subprocess.PIPE, 
                      timeout=5,
                      check=False)
        print("DNS resolution check completed.")
    except (subprocess.SubprocessError, FileNotFoundError):
        print("Note: Unable to perform DNS check. This is not critical.")

def run_install(max_retries=3, timeout=1200):
    """Run Julia dependency installation with retries and timeout."""
    # Julia project path
    julia_env_path = Path("/app/JuliaWorker").resolve()
    
    # Ensure the directory exists
    if not julia_env_path.exists():
        print(f"Creating Julia project directory at {julia_env_path}")
        julia_env_path.mkdir(parents=True, exist_ok=True)
    
    # Find Julia executable
    julia_executable = find_julia_executable()
    if not julia_executable:
        print("ERROR: Julia executable not found. Please ensure Julia is installed correctly.")
        sys.exit(1)
    
    print(f"Using Julia executable: {julia_executable}")
    print(f"Installing dependencies in: {julia_env_path}")
    print("Starting script to install Julia dependencies!")
    print("Please be patient! It can take 10+ minutes.")
    
    # Setup network environment
    setup_network_environment()
    
    # Define the Julia script with additional error handling and registry fallbacks
    julia_script = f"""
        println("Julia version: ", VERSION)
        println("Julia depot path: ", DEPOT_PATH)
        
        using Pkg
        
        # Configure timeout for downloads
        ENV["JULIA_PKG_TIMEOUT"] = 300  # 5 minutes timeout for downloads
        
        # Try to add registry with fallbacks
        function add_registry()
            try
                # Try EU registry first
                println("Attempting to add EU registry...")
                Pkg.Registry.add(Pkg.RegistrySpec(url="https://eu-central.pkg.julialang.org/"))
                return true
            catch e
                println("EU registry failed: ", e)
                try
                    # Fallback to main registry
                    println("Falling back to main registry...")
                    Pkg.Registry.add(Pkg.RegistrySpec(url="https://github.com/JuliaRegistries/General"))
                    return true
                catch e2
                    println("Main registry failed: ", e2)
                    return false
                end
            end
        end
        
        # Try to activate and instantiate with error handling
        function setup_environment()
            try
                println("Activating environment at {julia_env_path}...")
                Pkg.activate("{julia_env_path}")
                
                println("Checking if Project.toml exists...")
                if !isfile(joinpath("{julia_env_path}", "Project.toml"))
                    println("WARNING: Project.toml not found, creating a new project")
                    touch(joinpath("{julia_env_path}", "Project.toml"))
                end
                
                println("Running Pkg.instantiate()...")
                Pkg.instantiate(; verbose=true)
                println("Environment setup complete.")
                return true
            catch e
                println("ERROR during environment setup: ", e)
                return false
            end
        end
        
        # Main execution
        registry_success = add_registry()
        if !registry_success
            println("WARNING: Failed to add any registry. Continuing anyway...")
        end
        
        env_success = setup_environment()
        if !env_success
            exit(1)
        end
        
        println("Installation completed successfully.")
    """

    # Create a temporary file in a secure manner
    with tempfile.NamedTemporaryFile(suffix=".jl", delete=False) as temp_file:
        temp_file_path = temp_file.name
        temp_file.write(julia_script.encode())
    
    start_time = time.time()
    success = False
    
    for attempt in range(1, max_retries + 1):
        try:
            print(f"\nAttempt {attempt}/{max_retries}:")
            
            # Run the Julia script with a timeout
            process = subprocess.run(
                [julia_executable, temp_file_path],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=timeout
            )
            
            # Print output
            print(process.stdout)
            
            success = True
            print(f"Installation successful on attempt {attempt}.")
            break
            
        except subprocess.TimeoutExpired:
            print(f"Installation timed out after {timeout} seconds.")
        except subprocess.CalledProcessError as e:
            print(f"Installation failed with error code {e.returncode}")
            if e.stdout:
                print("Output:")
                print(e.stdout)
        except Exception as e:
            print(f"Unexpected error: {e}")
        
        # Don't sleep after the last attempt
        if attempt < max_retries:
            wait_time = 10 * attempt  # Exponential backoff
            print(f"Waiting {wait_time} seconds before retrying...")
            time.sleep(wait_time)
    
    # Clean up the temporary file
    try:
        os.unlink(temp_file_path)
    except Exception as e:
        print(f"Warning: Failed to remove temporary file {temp_file_path}: {e}")
    
    elapsed_time = time.time() - start_time
    print(f"Total time elapsed: {elapsed_time:.2f} seconds")
    
    if not success:
        print("ERROR: All installation attempts failed.")
        return False
    
    return True

if __name__ == "__main__":
    print(f"Running Julia dependency installer (Python {sys.version})")
    if run_install():
        print("Julia dependencies installed successfully!")
        sys.exit(0)
    else:
        print("Failed to install Julia dependencies.")
        sys.exit(1)
