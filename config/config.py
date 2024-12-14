from dotenv import load_dotenv
import os

def load_worker_config():
    load_dotenv()
    host = os.getenv("JULIA_PYTHON_HOST", "127.0.0.1")
    port = int(os.getenv("JULIA_PYTHON_PORT", "12345"))
    return host, port

def load_config():
    host = os.environ.get('JULIA_PYTHON_HOST', 'localhost')
    julia_port1 = int(os.environ.get('JULIA_PYTHON_PORT1', 50001))
    julia_port2 = int(os.environ.get('JULIA_PYTHON_PORT2', 50002))
    julia_port3 = int(os.environ.get('JULIA_PYTHON_PORT3', 50003))
    port1 = int(os.environ.get('PORT1', 8080))
    port2 = int(os.environ.get('PORT2', 8081))
    port3 = int(os.environ.get('PORT3', 8082))
    
    redis_host = os.environ.get('REDIS_HOST', 'localhost')
    redis_port = int(os.environ.get('REDIS_PORT', 6379))
    return host, port1,port2, port3, julia_port1,julia_port2,julia_port3, redis_port, redis_host

# def load_clients_config():
#     # Get port range from environment variables
#     PORT_START = int(os.getenv("CLIENT_WORKER_PORT_START", 40001))
#     PORT_END = int(os.getenv("CLIENT_WORKER_PORT_END", 40010))
#     return PORT_START, PORT_END