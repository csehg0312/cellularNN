import signal
import asyncio
from server.async_server import AsyncServer
from config.config import load_config
from contextlib import suppress

async def shutdown_servers(servers, loop, sig=None):
    """Coordinate shutdown of multiple servers"""
    if sig:
        print(f'Received exit signal {sig.name}...')
    
    print("Initiating shutdown of all servers...")
    
    # First, stop accepting new connections
    for server in servers:
        server.running = False
    
    # Shutdown servers one by one
    for server in servers:
        try:
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(server.shutdown(), timeout=5.0)
        except Exception as e:
            print(f"Error shutting down server: {e}")
    
    # Get all tasks
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    
    if tasks:
        print(f"Cancelling {len(tasks)} remaining tasks...")
        # Cancel all tasks
        for task in tasks:
            if not task.done():
                task.cancel()
        
        # Wait for tasks to finish
        with suppress(asyncio.CancelledError):
            await asyncio.gather(*tasks, return_exceptions=True)
    
    print("Stopping event loop...")
    try:
        loop.stop()
    except Exception as e:
        print(f"Error stopping loop: {e}")

async def main():
    # Load configuration
    host, port1, port2, port3, julia_port1, julia_port2, julia_port3, redis_port, redis_host = load_config()
    
    # Create servers
    servers = [
        # AsyncServer(host, port1, julia_port1, redis_host, redis_port),
        # AsyncServer(host, port2, julia_port2, redis_host, redis_port),
        AsyncServer(host, port3, julia_port3, redis_host, redis_port)
    ]
    
    # Get event loop
    loop = asyncio.get_running_loop()
    
    shutdown_event = asyncio.Event()
    
    def shutdown_callback(sig):
        print(f'Received exit signal {sig.name}...')
        shutdown_event.set()
    
    # Set up signal handlers
    for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda s=sig: shutdown_callback(s))
    
    try:
        # Start all servers
        print("Starting all servers...")
        server_tasks = [asyncio.create_task(server.start()) for server in servers]
        
        # Wait for shutdown signal
        await shutdown_event.wait()
        
    except Exception as e:
        print(f"Unexpected error: {e}")
    finally:
        # Shutdown servers
        await shutdown_servers(servers, loop)

def run():
    """Wrapper function to handle the asyncio.run() context"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        loop.run_until_complete(main())
    except KeyboardInterrupt:
        print("\nReceived keyboard interrupt")
    except Exception as e:
        print(f"Fatal error: {e}")
    finally:
        try:
            # Cancel all remaining tasks
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            
            # Wait for all tasks to complete with a timeout
            with suppress(asyncio.CancelledError):
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
        finally:
            loop.close()
            print("Shutdown complete")

if __name__ == "__main__":
    run()