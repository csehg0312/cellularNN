import signal

def setup_signal_handler(server):
    def signal_handler(sig, frame):
        print('\nYou pressed Ctrl+C!')
        server.stop()

    signal.signal(signal.SIGINT, signal_handler)